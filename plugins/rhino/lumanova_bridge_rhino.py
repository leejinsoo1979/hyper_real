# -*- coding: utf-8 -*-
# Lumanova Bridge - Rhino 8 스크립트 (실험적)
#
# SketchUp 플러그인(web_sync.rb)과 동일한 로컬 브릿지 프로토콜을 구현한다.
# 웹앱은 툴별 포트(SketchUp 9876 / Blender 9877 / Rhino 9878)를 스캔해
# 살아있는 브릿지에 연결한다.
#
# 사용법 (Rhino 8):
#   1. 명령줄에 ScriptEditor 입력 → 이 파일 열기 → 실행 (CPython 3)
#   2. 또는 명령줄에 _-RunPythonScript 입력 후 이 파일 선택
#   3. 실행 후 Rhino를 닫을 때까지 브릿지가 유지된다
#
# 씬 매핑: Rhino의 Named View = Lumanova 씬
#
# 스레딩 규칙: HTTP 스레드에서는 RhinoCommon을 호출하지 않는다.
# 명령은 큐에 넣고 RhinoApp.Idle(메인 스레드)에서 처리한다.

import sys

# Rhino 7 이하 / _-RunPythonScript는 IronPython(Python 2)이라 이 스크립트를 실행할 수 없다.
# 아래 py3 전용 import에 도달하기 전에 명확한 한국어 안내로 중단한다.
if sys.version_info[0] < 3:
    raise Exception(
        u'Lumanova Bridge는 Rhino 8의 ScriptEditor(CPython 3)에서 실행해야 합니다. '
        u'Rhino 8에서 명령줄에 ScriptEditor를 입력해 이 파일을 열고 실행하세요. '
        u'(Rhino 7 및 _-RunPythonScript의 IronPython은 지원되지 않습니다)'
    )

import base64
import json
import math
import os
import socket
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import Rhino
import scriptcontext as sc
import System

PORT = 9878  # 툴별 고정 포트: SketchUp 9876 / Blender 9877 / Rhino 9878
MIRROR_SIZE = (960, 540)
CONVERT_SIZES = {
    "1024": (1024, 576),
    "1536": (1536, 864),
    "1920": (1920, 1080),
}
HEIGHT_PRESETS_M = {"standing": 1.6, "seated": 1.1, "low_angle": 0.5}  # meters
LENS_PRESETS = {"wide": 24, "standard": 35, "telephoto": 85}           # mm
MOVE_STEP_M = 0.05
ROTATE_STEP = math.radians(2.0)

_state_lock = threading.Lock()
_state = {
    "source": None,
    "rendered": None,
    "viewport": None,
    "scenes_body": {"scenes": [], "timestamp": 0},
}
_commands = []
_cmd_lock = threading.Lock()

_server = None
_server_thread = None
_local_ip = "127.0.0.1"
_rhino_version = str(Rhino.RhinoApp.Version)


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


def _unit_scale():
    """미터 → 현재 문서 단위 배율."""
    doc = sc.doc
    return Rhino.RhinoMath.UnitScale(Rhino.UnitSystem.Meters, doc.ModelUnitSystem)


# ── HTTP 서버 (RhinoCommon 접근 금지 구역) ─────────────────────────────────
class _BridgeHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def _respond(self, obj, status=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
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
                "tool": "rhino",
                "ip": _local_ip,
                "port": PORT,
                "rhino": _rhino_version,
            })
        elif path == "/api/data":
            with _state_lock:
                self._respond({
                    "source": _state["source"],
                    "rendered": _state["rendered"],
                    "viewport": _state["viewport"],
                    "timestamp": int(time.time()),
                })
        elif path == "/api/scenes":
            with _state_lock:
                self._respond(_state["scenes_body"])
        elif path == "/api/mask":
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


# ── 메인 스레드 전용 ────────────────────────────────────────────────────────
def _active_view():
    doc = sc.doc
    return doc.Views.ActiveView if doc else None


def _capture(size=None):
    view = _active_view()
    if view is None:
        return
    dims = CONVERT_SIZES.get(str(size)) if size else None
    w, h = dims or MIRROR_SIZE
    try:
        bitmap = view.CaptureToBitmap(System.Drawing.Size(w, h))
        if bitmap is None:
            return
        temp_path = os.path.join(tempfile.gettempdir(), "lumanova_rhino_live.jpg")
        bitmap.Save(temp_path, System.Drawing.Imaging.ImageFormat.Jpeg)
        bitmap.Dispose()
        with open(temp_path, "rb") as f:
            encoded = base64.b64encode(f.read()).decode("ascii")

        doc = sc.doc
        title = None
        if doc and doc.Name:
            title = os.path.splitext(os.path.basename(doc.Name))[0]
        vp = view.ActiveViewport
        with _state_lock:
            _state["source"] = encoded
            _state["viewport"] = {
                "w": vp.Size.Width, "h": vp.Size.Height, "sf": 1.0, "title": title,
            }
    except Exception as e:  # noqa: BLE001
        print("[Lumanova] 캡처 에러: {}".format(e))


def _update_scenes():
    doc = sc.doc
    if doc is None:
        return
    scenes = []
    try:
        named_views = doc.NamedViews
        for i in range(named_views.Count):
            vi = named_views[i]
            scenes.append({"name": vi.Name, "active": False})
    except Exception as e:  # noqa: BLE001
        print("[Lumanova] 씬 목록 에러: {}".format(e))
    with _state_lock:
        _state["scenes_body"] = {"scenes": scenes, "timestamp": int(time.time())}


def _cmd_select_scene(name):
    doc = sc.doc
    view = _active_view()
    if doc is None or view is None:
        return
    named_views = doc.NamedViews
    for i in range(named_views.Count):
        if named_views[i].Name == str(name):
            named_views.Restore(i, view.ActiveViewport)
            view.Redraw()
            print("[Lumanova] 브릿지: 씬 전환 -> {}".format(name))
            return


def _cmd_add_scene():
    doc = sc.doc
    view = _active_view()
    if doc is None or view is None:
        return
    n = 1
    existing = {doc.NamedViews[i].Name for i in range(doc.NamedViews.Count)}
    while "Scene {}".format(n) in existing:
        n += 1
    doc.NamedViews.Add("Scene {}".format(n), view.ActiveViewportID)
    print("[Lumanova] 브릿지: 씬 추가 -> Scene {}".format(n))


def _cmd_camera(action, value):
    view = _active_view()
    if view is None:
        return
    vp = view.ActiveViewport
    scale = _unit_scale()
    step = MOVE_STEP_M * scale

    loc = vp.CameraLocation
    target = vp.CameraTarget
    direction = vp.CameraDirection

    if action == "fov":
        vp.Camera35mmLensLength = LENS_PRESETS.get(str(value), 35)
    elif action == "move":
        fwd = Rhino.Geometry.Vector3d(direction.X, direction.Y, 0.0)
        if not fwd.IsZero:
            fwd.Unitize()
        right = Rhino.Geometry.Vector3d.CrossProduct(fwd, Rhino.Geometry.Vector3d.ZAxis)
        right.Reverse()  # fwd×Z = 왼쪽 → 반전해 오른쪽
        if not right.IsZero:
            right.Unitize()
        delta = {
            "forward": fwd * step,
            "back": fwd * -step,
            "left": right * -step,
            "right": right * step,
            "up": Rhino.Geometry.Vector3d(0, 0, step),
            "down": Rhino.Geometry.Vector3d(0, 0, -step),
        }.get(str(value))
        if delta is not None:
            vp.SetCameraLocations(target + delta, loc + delta)
    elif action == "rotate":
        ang = ROTATE_STEP if str(value) == "left" else -ROTATE_STEP
        xform = Rhino.Geometry.Transform.Rotation(ang, Rhino.Geometry.Vector3d.ZAxis, loc)
        new_target = Rhino.Geometry.Point3d(target)
        new_target.Transform(xform)
        vp.SetCameraLocations(new_target, loc)
    elif action == "height":
        z = HEIGHT_PRESETS_M.get(str(value), 1.1) * scale
        new_loc = Rhino.Geometry.Point3d(loc.X, loc.Y, z)
        new_target = Rhino.Geometry.Point3d(target.X, target.Y, z)
        vp.SetCameraLocations(new_target, new_loc)
    elif action == "two_point":
        dist = loc.DistanceTo(target)
        fwd = Rhino.Geometry.Vector3d(direction.X, direction.Y, 0.0)
        if fwd.IsZero:
            return
        fwd.Unitize()
        new_target = loc + fwd * dist
        vp.SetCameraLocations(new_target, loc)
        vp.CameraUp = Rhino.Geometry.Vector3d.ZAxis

    view.Redraw()


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
            elif ctype == "add_scene":
                _cmd_add_scene()
                _update_scenes()
            elif ctype == "capture_mask":
                pass  # Rhino 미지원 — /api/mask가 빈 값 반환
        except Exception as e:  # noqa: BLE001
            print("[Lumanova] 브릿지 명령 에러({}): {}".format(cmd.get("type"), e))


# ── Idle 이벤트: 명령 처리 + 뷰 변경 감지 캡처 ──────────────────────────────
_last_sig = None
_view_moved = False
_last_check = 0.0


def _view_signature(vp):
    loc = vp.CameraLocation
    tgt = vp.CameraTarget
    return (
        round(loc.X, 4), round(loc.Y, 4), round(loc.Z, 4),
        round(tgt.X, 4), round(tgt.Y, 4), round(tgt.Z, 4),
        round(vp.Camera35mmLensLength, 2),
    )


def _on_idle(_sender, _args):
    global _last_sig, _view_moved, _last_check
    if _server is None:
        return
    try:
        _process_commands()

        now = time.time()
        if now - _last_check < 0.4:
            return
        _last_check = now

        view = _active_view()
        if view is not None:
            sig = _view_signature(view.ActiveViewport)
            if sig != _last_sig:
                _last_sig = sig
                _view_moved = True
            elif _view_moved:
                _view_moved = False
                _capture()
        _update_scenes()
    except Exception as e:  # noqa: BLE001
        print("[Lumanova] Idle 에러: {}".format(e))


# ── 시작/중지 ───────────────────────────────────────────────────────────────
def start_bridge():
    global _server, _server_thread, _local_ip
    if _server is not None:
        print("[Lumanova] 브릿지가 이미 실행 중입니다 (포트 {})".format(PORT))
        return

    _local_ip = _get_local_ip()
    try:
        _server = ThreadingHTTPServer(("0.0.0.0", PORT), _BridgeHandler)
        _server.daemon_threads = True
    except OSError as e:
        _server = None
        print("[Lumanova] 서버 시작 실패 - 포트 {} 사용 중?: {}".format(PORT, e))
        return

    _server_thread = threading.Thread(target=_server.serve_forever)
    _server_thread.daemon = True
    _server_thread.start()

    Rhino.RhinoApp.Idle += _on_idle
    print("[Lumanova] 로컬 서버 시작: http://{}:{}".format(_local_ip, PORT))
    print("[Lumanova] Lumanova 웹앱이 자동으로 연결됩니다. Rhino를 닫으면 중지됩니다.")


def stop_bridge():
    global _server, _server_thread
    Rhino.RhinoApp.Idle -= _on_idle
    if _server is not None:
        _server.shutdown()
        _server.server_close()
        _server = None
    _server_thread = None
    print("[Lumanova] 로컬 서버 중지")


start_bridge()
