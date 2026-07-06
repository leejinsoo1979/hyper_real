# Lumanova Bridge - Blender 애드온
#
# SketchUp 플러그인(web_sync.rb)과 동일한 로컬 브릿지 프로토콜을 구현한다.
# 웹앱은 툴별 포트(SketchUp 9876 / Blender 9877 / Rhino 9878)를 스캔해
# 살아있는 브릿지에 연결하므로, 이 애드온을 켜면 Blender 뷰포트가
# SketchUp과 똑같이 웹앱에 실시간 미러링된다. (SketchUp 동시 실행 가능)
#
# 프로토콜 (web_sync.rb와 1:1 대응):
#   GET  /api/ping     연결 확인 { status:'ok', app, tool:'blender', ... }
#   GET  /api/data     { source: base64 JPEG, rendered, viewport:{w,h,sf,title}, timestamp }
#   GET  /api/scenes   { scenes:[{name,active}], timestamp }  — Blender 카메라 = 씬
#   GET  /api/materials { materials:[...], timestamp }         — Blender 재질 노드 요약
#   GET  /api/mask     { mask, map, timestamp }               — Blender는 미지원(빈 값)
#   GET  /api/apikey   { apiKey:'' }                          — Blender는 키 미보관
#   POST /api/command  { type: select_scene|camera|capture|add_scene|capture_mask }
#   POST /api/result   렌더 결과 수신
#
# 스레딩 규칙 (SketchUp의 WEBrick+UI.start_timer 구조와 동일):
#   HTTP 핸들러 스레드에서는 bpy를 호출하지 않는다. 명령은 큐에 넣고
#   bpy.app.timers(메인 스레드)가 처리하며, 상태는 락으로 공유한다.

bl_info = {
    "name": "Lumanova Bridge",
    "author": "Lumanova",
    "version": (1, 0, 0),
    "blender": (4, 2, 0),
    "location": "View3D > Sidebar > Lumanova",
    "description": "Lumanova 웹앱과 뷰포트를 동기화하는 로컬 브릿지 (포트 9877)",
    "category": "System",
}

import base64
import json
import math
import os
import socket
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import bpy
from mathutils import Euler, Matrix, Vector

PORT = 9877  # 툴별 고정 포트: SketchUp 9876 / Blender 9877 / Rhino 9878
MIRROR_SIZE = (960, 540)          # 미러링용 기본 해상도 (SketchUp과 동일)
CONVERT_SIZES = {                  # Convert(고품질) 캡처 해상도
    "1024": (1024, 576),
    "1536": (1536, 864),
    "1920": (1920, 1080),
}
HEIGHT_PRESETS = {"standing": 1.6, "seated": 1.1, "low_angle": 0.5}   # m
LENS_PRESETS = {"wide": 24, "standard": 35, "telephoto": 85}          # mm
MOVE_STEP = 0.05                   # 5cm (SketchUp의 2인치와 동일)
ROTATE_STEP = math.radians(2.0)

# ── HTTP 스레드 ↔ 메인 스레드 공유 상태 ─────────────────────────────────────
_state_lock = threading.Lock()
_state = {
    "source": None,                # base64 JPEG (최신 뷰포트 캡처)
    "rendered": None,              # 웹앱이 push한 렌더 결과
    "viewport": None,              # { w, h, sf, title }
    "scenes_body": {"scenes": [], "timestamp": 0},
    "depth": None,                 # base64 (Mist 깊이맵 — 구조 고정 렌더용)
    "depth_ts": 0,
    "materials_body": {"materials": [], "timestamp": 0},
}
_commands = []
_cmd_lock = threading.Lock()

_server = None
_server_thread = None
_server_error = None
_local_ip = "127.0.0.1"
_blender_version = bpy.app.version_string


def _get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
        finally:
            s.close()
    except OSError:
        return "127.0.0.1"


# ── HTTP 서버 (bpy 접근 금지 구역) ──────────────────────────────────────────
class _BridgeHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def _respond(self, obj, status=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        # Chrome PNA: 공개 https 사이트(Vercel 배포)에서 localhost 접근 허용
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_OPTIONS(self):
        self._respond({}, 200)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/ping":
            self._respond({
                "status": "ok",
                "app": "Lumanova Bridge",
                "tool": "blender",
                "ip": _local_ip,
                "port": PORT,
                "blender": _blender_version,
            })
        elif path == "/api/data":
            with _state_lock:
                self._respond({
                    "source": _state["source"],
                    "rendered": _state["rendered"],
                    "viewport": _state["viewport"],
                    "depth": _state["depth"],
                    "depthTimestamp": _state["depth_ts"],
                    "timestamp": int(time.time()),
                })
        elif path == "/api/scenes":
            with _state_lock:
                self._respond(_state["scenes_body"])
        elif path == "/api/materials":
            with _state_lock:
                self._respond(_state["materials_body"])
        elif path == "/api/mask":
            # Blender는 재질 ID 마스크 미지원 (웹앱은 mask 없음 = 기능 비활성 처리)
            self._respond({"mask": None, "map": [], "timestamp": 0})
        elif path == "/api/apikey":
            self._respond({"apiKey": ""})
        else:
            self._respond({"error": "not found"}, 404)

    def do_POST(self):
        path = self.path.split("?")[0]
        try:
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, json.JSONDecodeError):
            self._respond({"accepted": False, "error": "invalid json"}, 400)
            return

        if path == "/api/command":
            with _cmd_lock:
                _commands.append(data)
            self._respond({"accepted": True})
        elif path == "/api/result":
            with _state_lock:
                _state["rendered"] = data.get("image")
            self._respond({"received": True})
        else:
            self._respond({"error": "not found"}, 404)


# ── 메인 스레드 전용: 뷰포트 접근 헬퍼 ──────────────────────────────────────
def _find_view3d():
    """(window, area, region, space) — 첫 번째 3D 뷰포트."""
    for wm in bpy.data.window_managers:
        for window in wm.windows:
            screen = window.screen
            if not screen:
                continue
            for area in screen.areas:
                if area.type != "VIEW_3D":
                    continue
                region = next((r for r in area.regions if r.type == "WINDOW"), None)
                space = area.spaces.active
                if region and space and space.region_3d:
                    return window, area, region, space
    return None, None, None, None


def _viewport_eye(rv3d):
    return rv3d.view_location + rv3d.view_rotation @ Vector((0.0, 0.0, rv3d.view_distance))


def _view_signature(space):
    rv3d = space.region_3d
    m = rv3d.view_matrix
    sig = [round(v, 5) for row in m for v in row]
    sig.append(round(space.lens, 3))
    sig.append(rv3d.view_perspective)
    return tuple(sig)


# ── 캡처 (SketchUp capture_current_view와 동일한 역할) ─────────────────────
def _capture(size=None):
    window, area, region, space = _find_view3d()
    if not window or not region or not space:
        return
    dims = CONVERT_SIZES.get(str(size)) if size else None
    w, h = dims or MIRROR_SIZE

    scene = window.scene
    r = scene.render
    saved = (
        r.resolution_x, r.resolution_y, r.resolution_percentage,
        r.image_settings.file_format, r.image_settings.quality,
        r.image_settings.color_mode, r.filepath,
    )
    saved_overlays = space.overlay.show_overlays
    try:
        r.resolution_x, r.resolution_y, r.resolution_percentage = w, h, 100
        r.image_settings.file_format = "JPEG"
        r.image_settings.quality = 85 if dims else 75
        r.image_settings.color_mode = "RGB"
        # 그리드/축/선택 외곽선은 AI 렌더링 소스에 노이즈 — 캡처 순간에만 끈다
        space.overlay.show_overlays = False

        with bpy.context.temp_override(window=window, area=area, region=region):
            bpy.ops.render.opengl(view_context=True)

        img = bpy.data.images.get("Render Result")
        if not img:
            return
        temp_path = os.path.join(tempfile.gettempdir(), "lumanova_blender_live.jpg")
        img.save_render(filepath=temp_path, scene=scene)
        with open(temp_path, "rb") as f:
            encoded = base64.b64encode(f.read()).decode("ascii")

        title = os.path.splitext(os.path.basename(bpy.data.filepath))[0] or None
        with _state_lock:
            _state["source"] = encoded
            _state["viewport"] = {"w": region.width, "h": region.height, "sf": 1.0, "title": title}
    except Exception as e:  # noqa: BLE001 — 캡처 실패가 타이머를 죽이면 안 된다
        print(f"[Lumanova] 캡처 에러: {e}")
    finally:
        space.overlay.show_overlays = saved_overlays
        (r.resolution_x, r.resolution_y, r.resolution_percentage) = saved[0:3]
        r.image_settings.file_format = saved[3]
        r.image_settings.quality = saved[4]
        r.image_settings.color_mode = saved[5]
        r.filepath = saved[6]


# ── 깊이맵 캡처 (Mist 패스) — 구조 고정 렌더용 ──────────────────────────────
def _capture_depth():
    window, area, region, space = _find_view3d()
    if not window or not region or not space:
        return

    scene = window.scene
    view_layer = window.view_layer
    world = scene.world
    r = scene.render

    saved_render = (
        r.resolution_x, r.resolution_y, r.resolution_percentage,
        r.image_settings.file_format, r.image_settings.quality,
        r.image_settings.color_mode, r.filepath,
    )
    saved_shading = (space.shading.type, getattr(space.shading, "render_pass", "COMBINED"))
    saved_overlays = space.overlay.show_overlays
    saved_mist_pass = view_layer.use_pass_mist
    saved_mist = None
    if world:
        ms = world.mist_settings
        saved_mist = (ms.start, ms.depth, ms.falloff)

    try:
        # 씬 규모에 맞는 mist 깊이 (뷰포트 시점에서 가장 먼 오브젝트까지)
        eye = _viewport_eye(space.region_3d)
        far = 30.0
        for obj in scene.objects:
            if obj.type not in {"MESH", "CURVE", "SURFACE", "META", "FONT"}:
                continue
            for corner in obj.bound_box:
                p = obj.matrix_world @ Vector(corner)
                far = max(far, (p - eye).length)
        if world:
            world.mist_settings.start = 0.0
            world.mist_settings.depth = far * 1.05
            world.mist_settings.falloff = "LINEAR"

        view_layer.use_pass_mist = True
        space.shading.type = "MATERIAL"
        space.shading.render_pass = "MIST"
        space.overlay.show_overlays = False

        r.resolution_x, r.resolution_y, r.resolution_percentage = MIRROR_SIZE[0], MIRROR_SIZE[1], 100
        r.image_settings.file_format = "JPEG"
        r.image_settings.quality = 88
        r.image_settings.color_mode = "BW"

        with bpy.context.temp_override(window=window, area=area, region=region):
            bpy.ops.render.opengl(view_context=True)

        img = bpy.data.images.get("Render Result")
        if not img:
            return
        temp_path = os.path.join(tempfile.gettempdir(), "lumanova_blender_depth.jpg")
        img.save_render(filepath=temp_path, scene=scene)
        with open(temp_path, "rb") as f:
            encoded = base64.b64encode(f.read()).decode("ascii")
        with _state_lock:
            _state["depth"] = encoded
            _state["depth_ts"] = int(time.time() * 1000)
        print("[Lumanova] 깊이맵 캡처 완료 (Mist)")
    except Exception as e:  # noqa: BLE001
        print(f"[Lumanova] 깊이맵 캡처 에러: {e}")
    finally:
        space.overlay.show_overlays = saved_overlays
        space.shading.type = saved_shading[0]
        try:
            space.shading.render_pass = saved_shading[1]
        except Exception:  # noqa: BLE001
            pass
        view_layer.use_pass_mist = saved_mist_pass
        if world and saved_mist:
            world.mist_settings.start, world.mist_settings.depth, world.mist_settings.falloff = saved_mist
        (r.resolution_x, r.resolution_y, r.resolution_percentage) = saved_render[0:3]
        r.image_settings.file_format = saved_render[3]
        r.image_settings.quality = saved_render[4]
        r.image_settings.color_mode = saved_render[5]
        r.filepath = saved_render[6]


# ── 씬 목록 = 카메라 목록 (SketchUp의 Pages에 대응) ─────────────────────────
def _update_scenes():
    _, _, _, space = _find_view3d()
    scene = bpy.context.scene
    if scene is None:
        return
    cams = [o for o in scene.objects if o.type == "CAMERA"]
    in_camera_view = bool(space) and space.region_3d.view_perspective == "CAMERA"
    active = scene.camera.name if (scene.camera and in_camera_view) else None
    scenes = [{"name": c.name, "active": c.name == active} for c in cams]
    with _state_lock:
        _state["scenes_body"] = {"scenes": scenes, "timestamp": int(time.time())}


# ── 재질 노드 속성 요약 (메인 스레드) ───────────────────────────────────────
def _socket_value(socket, fallback=None):
    if not socket:
        return fallback
    try:
        value = socket.default_value
        if hasattr(value, "__len__") and not isinstance(value, str):
            return [round(float(v), 5) for v in value]
        return round(float(value), 5)
    except Exception:  # noqa: BLE001
        return fallback


def _find_principled_node(mat):
    if not mat or not mat.use_nodes or not mat.node_tree:
        return None
    for node in mat.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            return node
    return None


def _linked_image_paths(socket, seen=None):
    """입력 소켓으로 연결된 Image Texture 경로들을 얕게 추적한다."""
    if not socket or not socket.is_linked:
        return []
    seen = seen or set()
    paths = []
    for link in socket.links:
        node = link.from_node
        if not node or node.name in seen:
            continue
        seen.add(node.name)
        if node.type == "TEX_IMAGE" and getattr(node, "image", None):
            try:
                paths.append(bpy.path.abspath(node.image.filepath))
            except Exception:  # noqa: BLE001
                paths.append(node.image.filepath)
        for input_socket in getattr(node, "inputs", []):
            paths.extend(_linked_image_paths(input_socket, seen))
    # preserve order while deduping
    return list(dict.fromkeys([p for p in paths if p]))


def _material_object_names(mat):
    names = []
    for obj in bpy.context.scene.objects:
        slots = getattr(obj, "material_slots", [])
        if any(slot.material == mat for slot in slots):
            names.append(obj.name)
    return names[:20]


def _material_summary(mat):
    principled = _find_principled_node(mat)
    base_color = _socket_value(principled.inputs.get("Base Color") if principled else None, [1, 1, 1, 1])
    metallic = _socket_value(principled.inputs.get("Metallic") if principled else None, 0)
    roughness = _socket_value(principled.inputs.get("Roughness") if principled else None, 0.5)
    alpha = _socket_value(principled.inputs.get("Alpha") if principled else None, 1)
    emission_color = _socket_value(principled.inputs.get("Emission Color") if principled else None, [0, 0, 0, 1])
    emission_strength = _socket_value(principled.inputs.get("Emission Strength") if principled else None, 0)

    textures = {}
    if principled:
        for label, socket_name in (
            ("baseColor", "Base Color"),
            ("roughness", "Roughness"),
            ("metallic", "Metallic"),
            ("alpha", "Alpha"),
            ("normal", "Normal"),
            ("emission", "Emission Color"),
        ):
            found = _linked_image_paths(principled.inputs.get(socket_name))
            if found:
                textures[label] = found

    return {
        "name": mat.name,
        "objectNames": _material_object_names(mat),
        "useNodes": bool(mat.use_nodes),
        "shader": "Principled BSDF" if principled else "Material",
        "baseColor": base_color,
        "metallic": metallic,
        "roughness": roughness,
        "alpha": alpha,
        "emissionColor": emission_color,
        "emissionStrength": emission_strength,
        "textures": textures,
    }


def _update_materials():
    materials = []
    for mat in bpy.data.materials:
        try:
            # 앱에서 바로 쓸 수 있도록 실제 씬에 배치된 재질을 우선한다.
            if not _material_object_names(mat):
                continue
            materials.append(_material_summary(mat))
        except Exception as e:  # noqa: BLE001
            print(f"[Lumanova] 재질 읽기 에러({mat.name}): {e}")
    materials.sort(key=lambda m: m["name"].lower())
    with _state_lock:
        _state["materials_body"] = {
            "source": "blender",
            "materials": materials[:200],
            "timestamp": int(time.time()),
        }


# ── 명령 처리 (메인 스레드) ─────────────────────────────────────────────────
def _cmd_select_scene(name):
    scene = bpy.context.scene
    cam = scene.objects.get(str(name))
    if not cam or cam.type != "CAMERA":
        return
    scene.camera = cam
    _, _, _, space = _find_view3d()
    if space:
        space.region_3d.view_perspective = "CAMERA"
    print(f"[Lumanova] 브릿지: 씬 전환 -> {name}")


def _cmd_add_scene():
    _, _, _, space = _find_view3d()
    if not space:
        return
    rv3d = space.region_3d
    scene = bpy.context.scene

    n = 1
    while f"Scene {n}" in scene.objects:
        n += 1
    cam_data = bpy.data.cameras.new(f"Scene {n}")
    cam_data.lens = space.lens
    cam = bpy.data.objects.new(f"Scene {n}", cam_data)
    scene.collection.objects.link(cam)

    cam.matrix_world = rv3d.view_matrix.inverted()
    scene.camera = cam
    print(f"[Lumanova] 브릿지: 씬 추가 -> Scene {n}")


def _horizontal_yaw(forward):
    """수평 전방벡터의 yaw. (Rx90 기준: -Z가 +Y를 향할 때 yaw=0)"""
    return math.atan2(-forward.x, forward.y)


def _cmd_camera(action, value):
    _, _, _, space = _find_view3d()
    if not space:
        return
    rv3d = space.region_3d
    in_camera_view = rv3d.view_perspective == "CAMERA"
    cam = bpy.context.scene.camera if in_camera_view else None

    if action == "fov":
        lens = LENS_PRESETS.get(str(value), 35)
        if cam:
            cam.data.lens = lens
        else:
            space.lens = lens
        return

    if cam:
        quat = cam.matrix_world.to_quaternion()
        fwd = quat @ Vector((0.0, 0.0, -1.0))
        fwd.z = 0.0
        if fwd.length > 0:
            fwd.normalize()
        right = quat @ Vector((1.0, 0.0, 0.0))
        right.z = 0.0
        if right.length > 0:
            right.normalize()

        if action == "move":
            delta = {
                "forward": fwd * MOVE_STEP, "back": -fwd * MOVE_STEP,
                "left": -right * MOVE_STEP, "right": right * MOVE_STEP,
                "up": Vector((0, 0, MOVE_STEP)), "down": Vector((0, 0, -MOVE_STEP)),
            }.get(str(value))
            if delta:
                cam.location += delta
        elif action == "rotate":
            ang = ROTATE_STEP if str(value) == "left" else -ROTATE_STEP
            loc = cam.matrix_world.translation.copy()
            rot = Matrix.Rotation(ang, 4, "Z")
            cam.matrix_world = (
                Matrix.Translation(loc) @ rot @ Matrix.Translation(-loc) @ cam.matrix_world
            )
        elif action == "height":
            cam.location.z = HEIGHT_PRESETS.get(str(value), 1.1)
        elif action == "two_point":
            yaw = _horizontal_yaw(quat @ Vector((0.0, 0.0, -1.0)))
            loc = cam.location.copy()
            cam.rotation_euler = Euler((math.radians(90.0), 0.0, yaw), "XYZ")
            cam.location = loc
        return

    # 뷰포트 내비게이션 (카메라 뷰가 아닐 때)
    quat = rv3d.view_rotation
    fwd = quat @ Vector((0.0, 0.0, -1.0))
    fwd.z = 0.0
    if fwd.length > 0:
        fwd.normalize()
    right = quat @ Vector((1.0, 0.0, 0.0))
    right.z = 0.0
    if right.length > 0:
        right.normalize()

    if action == "move":
        delta = {
            "forward": fwd * MOVE_STEP, "back": -fwd * MOVE_STEP,
            "left": -right * MOVE_STEP, "right": right * MOVE_STEP,
            "up": Vector((0, 0, MOVE_STEP)), "down": Vector((0, 0, -MOVE_STEP)),
        }.get(str(value))
        if delta:
            rv3d.view_location += delta
    elif action == "rotate":
        # 시점(eye) 고정 회전: 피벗이 아니라 카메라가 제자리에서 도는 느낌 (SketchUp과 동일)
        ang = ROTATE_STEP if str(value) == "left" else -ROTATE_STEP
        eye = _viewport_eye(rv3d)
        new_rot = Matrix.Rotation(ang, 3, "Z").to_quaternion() @ quat
        rv3d.view_rotation = new_rot
        rv3d.view_location = eye - new_rot @ Vector((0.0, 0.0, rv3d.view_distance))
    elif action == "height":
        target_z = HEIGHT_PRESETS.get(str(value), 1.1)
        eye_z = _viewport_eye(rv3d).z
        rv3d.view_location.z += target_z - eye_z
    elif action == "two_point":
        eye = _viewport_eye(rv3d)
        yaw = _horizontal_yaw(quat @ Vector((0.0, 0.0, -1.0)))
        new_rot = Euler((math.radians(90.0), 0.0, yaw), "XYZ").to_quaternion()
        rv3d.view_rotation = new_rot
        rv3d.view_location = eye - new_rot @ Vector((0.0, 0.0, rv3d.view_distance))


def _process_commands():
    with _cmd_lock:
        cmds = list(_commands)
        _commands.clear()

    for cmd in cmds:
        try:
            ctype = cmd.get("type")
            if ctype == "select_scene":
                _cmd_select_scene(cmd.get("name"))
            elif ctype == "camera":
                _cmd_camera(cmd.get("action"), cmd.get("value"))
            elif ctype == "capture":
                _capture(cmd.get("size"))
            elif ctype == "capture_depth":
                _capture_depth()
            elif ctype == "add_scene":
                _cmd_add_scene()
                _update_scenes()
            elif ctype == "capture_mask":
                pass  # Blender 미지원 — /api/mask가 빈 값을 반환
        except Exception as e:  # noqa: BLE001
            print(f"[Lumanova] 브릿지 명령 에러({cmd.get('type')}): {e}")


# ── 메인 타이머: 명령 처리 + 뷰 변경 감지 캡처 (SketchUp 타이머 2개에 대응) ──
_last_sig = None
_view_moved = False
_tick_count = 0


def _tick():
    global _last_sig, _view_moved, _tick_count
    if _server is None:
        return None  # 서버 중지 → 타이머 종료

    try:
        _process_commands()

        _tick_count += 1
        # 뷰 변경 감지는 0.4초 주기 (명령 처리는 0.2초 주기 유지)
        if _tick_count % 2 == 0:
            _, _, _, space = _find_view3d()
            if space:
                sig = _view_signature(space)
                if sig != _last_sig:
                    _last_sig = sig
                    _view_moved = True   # 움직이는 중 — 캡처 보류
                elif _view_moved:
                    _view_moved = False  # 멈춘 직후 1회만 캡처
                    _capture()
            _update_scenes()
            if _tick_count % 10 == 0:
                _update_materials()
    except Exception as e:  # noqa: BLE001
        print(f"[Lumanova] 타이머 에러: {e}")

    return 0.2


# ── 서버 시작/중지 ──────────────────────────────────────────────────────────
def start_server():
    global _server, _server_thread, _server_error, _local_ip
    if _server is not None:
        return

    _local_ip = _get_local_ip()
    try:
        _server = ThreadingHTTPServer(("0.0.0.0", PORT), _BridgeHandler)
        _server.daemon_threads = True
        _server_error = None
    except OSError as e:
        _server = None
        _server_error = f"포트 {PORT} 사용 중 (다른 브릿지 실행 중?): {e}"
        print(f"[Lumanova] 서버 시작 실패: {_server_error}")
        return

    _server_thread = threading.Thread(target=_server.serve_forever, daemon=True)
    _server_thread.start()
    bpy.app.timers.register(_tick, first_interval=0.5, persistent=True)
    print(f"[Lumanova] 로컬 서버 시작: http://{_local_ip}:{PORT}")


def stop_server():
    global _server, _server_thread
    if _server is not None:
        _server.shutdown()
        _server.server_close()
        _server = None
    _server_thread = None
    print("[Lumanova] 로컬 서버 중지")


# ── UI 패널 ─────────────────────────────────────────────────────────────────
class LUMANOVA_PT_bridge(bpy.types.Panel):
    bl_label = "Lumanova Bridge"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Lumanova"

    def draw(self, context):
        layout = self.layout
        if _server is not None:
            layout.label(text=f"연결 대기 중 · 포트 {PORT}", icon="LINKED")
            layout.label(text=f"http://{_local_ip}:{PORT}")
        elif _server_error:
            layout.label(text="서버 시작 실패", icon="ERROR")
            layout.label(text=_server_error)
            layout.operator("lumanova.restart_bridge")
        else:
            layout.label(text="중지됨", icon="UNLINKED")
            layout.operator("lumanova.restart_bridge")


class LUMANOVA_OT_restart_bridge(bpy.types.Operator):
    bl_idname = "lumanova.restart_bridge"
    bl_label = "브릿지 재시작"

    def execute(self, _context):
        stop_server()
        start_server()
        return {"FINISHED"}


_classes = (LUMANOVA_PT_bridge, LUMANOVA_OT_restart_bridge)


def register():
    for cls in _classes:
        bpy.utils.register_class(cls)
    start_server()


def unregister():
    stop_server()
    for cls in _classes:
        bpy.utils.unregister_class(cls)


if __name__ == "__main__":
    register()
