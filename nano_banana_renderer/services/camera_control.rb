# frozen_string_literal: true

# NanoBanana Renderer - 카메라 컨트롤 + 미러링
# 2P 카메라, 이동/회전, FOV, 높이, 미러링 기능

module NanoBanana
  class << self
    # ========================================
    # 2P 카메라 Tool
    # ========================================
    def activate_camera_tool
      @camera_tool ||= CameraTool.new
      Sketchup.active_model.select_tool(@camera_tool)
    end

    def set_camera_height(height_key)
      @camera_tool ||= CameraTool.new
      @camera_tool.set_height(height_key.to_sym)
    end

    def set_camera_fov(fov_key)
      @camera_tool ||= CameraTool.new
      @camera_tool.set_fov(fov_key.to_sym)
    end

    # 카메라 이동 (UI 버튼용)
    def camera_move(direction)
      view = Sketchup.active_model.active_view
      camera = view.camera

      # 이동 거리 (인치, 약 5cm)
      step = 2.0
      step_z = 1.0

      # 카메라 방향 벡터 (수평)
      dir = camera.direction.clone
      dir.z = 0
      dir.normalize! if dir.length > 0

      # 오른쪽 벡터
      right = dir.cross(Z_AXIS)
      right.normalize! if right.length > 0

      move = Geom::Vector3d.new(0, 0, 0)

      case direction
      when 'forward'
        move = Geom::Vector3d.new(dir.x * step, dir.y * step, 0)
      when 'back'
        move = Geom::Vector3d.new(-dir.x * step, -dir.y * step, 0)
      when 'left'
        move = Geom::Vector3d.new(-right.x * step, -right.y * step, 0)
      when 'right'
        move = Geom::Vector3d.new(right.x * step, right.y * step, 0)
      when 'up'
        move = Geom::Vector3d.new(0, 0, step_z)
      when 'down'
        move = Geom::Vector3d.new(0, 0, -step_z)
      end

      new_eye = camera.eye.offset(move)
      new_target = camera.target.offset(move)
      camera.set(new_eye, new_target, Z_AXIS)
      view.invalidate
    end

    # 카메라 회전 (UI 버튼용)
    def camera_rotate(direction)
      view = Sketchup.active_model.active_view
      camera = view.camera

      # 회전 각도 (도) - 2도씩
      angle = (direction == 'left' ? 2.0 : -2.0).degrees

      eye = camera.eye
      view_vector = eye.vector_to(camera.target)
      distance = view_vector.length

      # Z축 기준 회전
      rotation = Geom::Transformation.rotation(eye, Z_AXIS, angle)
      new_direction = view_vector.transform(rotation)
      new_direction.length = distance

      new_target = eye.offset(new_direction)
      camera.set(eye, new_target, Z_AXIS)
      view.invalidate
    end

    # 2점 투시 자동 보정
    def apply_two_point_perspective
      view = Sketchup.active_model.active_view
      camera = view.camera

      eye = camera.eye
      target = camera.target

      # 시선 방향 벡터
      view_vector = eye.vector_to(target)

      # 수평 방향만 유지 (Z 성분 제거)
      horizontal_dir = Geom::Vector3d.new(view_vector.x, view_vector.y, 0)

      if horizontal_dir.length > 0
        horizontal_dir.normalize!
        distance = Math.sqrt(view_vector.x**2 + view_vector.y**2 + view_vector.z**2)

        # 새 타겟: 같은 높이에서 수평으로 바라봄
        new_target = Geom::Point3d.new(
          eye.x + horizontal_dir.x * distance,
          eye.y + horizontal_dir.y * distance,
          eye.z  # 같은 높이
        )

        # Z_AXIS를 up으로 설정하면 수직선 고정
        camera.set(eye, new_target, Z_AXIS)
        view.invalidate
        puts "[NanoBanana] 2점 투시 적용됨"
      end
    rescue StandardError => e
      puts "[NanoBanana] 2점 투시 에러: #{e.message}"
    end

    # 카메라 높이 설정 (UI 버튼용)
    def camera_set_height(preset)
      view = Sketchup.active_model.active_view
      camera = view.camera

      heights = {
        'standing' => 63.0,   # 1.6m in inches
        'seated' => 43.3,     # 1.1m in inches
        'low_angle' => 19.7   # 0.5m in inches
      }

      height = heights[preset] || 43.3

      eye = camera.eye
      target = camera.target

      new_eye = Geom::Point3d.new(eye.x, eye.y, height)
      new_target = Geom::Point3d.new(target.x, target.y, height)

      camera.set(new_eye, new_target, Z_AXIS)
      view.invalidate
    end

    # 카메라 FOV 설정 (UI 버튼용)
    def camera_set_fov(preset)
      view = Sketchup.active_model.active_view
      camera = view.camera

      fovs = {
        'wide' => 74,       # 광각 24mm
        'standard' => 54,   # 표준 35mm
        'telephoto' => 28   # 망원 85mm
      }

      fov = fovs[preset] || 54

      camera.perspective = true
      camera.fov = fov
      view.invalidate
    end

    # ========================================
    # 미러링 기능
    # ========================================

    # 미러링 시작
    def start_mirror
      @mirror_active = true

      # ViewObserver 등록
      @view_observer ||= MirrorViewObserver.new(self)
      Sketchup.active_model.active_view.add_observer(@view_observer)

      # 초기 캡처
      mirror_capture

      puts "[NanoBanana] 미러링 시작"
    end

    # 미러링 중지
    def stop_mirror
      @mirror_active = false

      # ViewObserver 제거
      if @view_observer
        begin
          Sketchup.active_model.active_view.remove_observer(@view_observer)
        rescue
        end
      end

      puts "[NanoBanana] 미러링 중지"
    end

    # 미러링 캡처 (적정 해상도)
    def mirror_capture
      return unless @mirror_active
      return unless @main_dialog

      begin
        temp_path = File.join(Dir.tmpdir, 'nanobanana_mirror.jpg')
        view = Sketchup.active_model.active_view

        # 프리뷰 해상도 - 초기 로딩과 미러링 반응 속도 우선
        view.write_image({
          filename: temp_path,
          width: 640,
          height: 360,
          antialias: false,
          compression: 0.5
        })

        image_data = Base64.strict_encode64(File.binread(temp_path))

        @main_dialog.execute_script("onMirrorUpdate('#{image_data}')")
      rescue StandardError => e
        # 에러 시 무시
      end
    end

    def mirror_active?
      @mirror_active
    end
  end
end
