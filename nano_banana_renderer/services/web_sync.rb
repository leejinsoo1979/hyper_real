# frozen_string_literal: true

# NanoBanana Renderer - 웹 동기화
# 로컬 WEBrick 서버, 동기화 기능

# WEBrick ProcHandler는 do_OPTIONS가 없어 브라우저 CORS 프리플라이트에 405(헤더 없음)로
# 응답한다 → 브라우저에서 POST(/api/command 등)가 전부 차단. GET 핸들러로 위임해 해결.
if defined?(WEBrick::HTTPServlet::ProcHandler) &&
   !WEBrick::HTTPServlet::ProcHandler.method_defined?(:do_OPTIONS)
  WEBrick::HTTPServlet::ProcHandler.class_eval { alias_method :do_OPTIONS, :do_GET }
end

module NanoBanana
  # UI.start_timer 컨텍스트에서 카메라/씬 '변경'이 조용히 무시되는 SketchUp 제약 회피.
  # View#animation의 nextFrame은 렌더 루프에서 실행되어 뷰 변경이 허용된다.
  class BridgeExec
    def initialize(on_done = nil, &block)
      @block = block
      @on_done = on_done
    end

    def nextFrame(view)
      begin
        @block.call
      rescue StandardError => e
        NanoBanana.puts "[NanoBanana] 브릿지 뷰 실행 에러: #{e.message}"
      end
      view.show_frame
      # 변경이 '적용된 후'에만 후속 작업(캡처) 실행 - 이전 화면이 찍히는 레이스 방지
      if @on_done
        done = @on_done
        @on_done = nil
        UI.start_timer(0.1, false) { done.call }
      end
      false # 1프레임만 실행하고 종료
    end
  end

  class << self
    # ========================================
    # 로컬 웹 서버 (동기화용)
    # ========================================

    def web_sync_active?
      @local_server != nil
    end

    def get_local_ip
      Socket.ip_address_list.find { |addr|
        addr.ipv4? && !addr.ipv4_loopback?
      }&.ip_address || '127.0.0.1'
    end

    def start_local_server
      return if @local_server

      @local_port = 9876
      local_ip = get_local_ip

      # 브릿지 명령 큐 (WEBrick 스레드에서 push, 메인 스레드 타이머에서 실행)
      # WEBrick 핸들러에서 SketchUp API를 직접 호출하면 안 된다.
      @bridge_commands = []
      @bridge_mutex = Mutex.new
      @bridge_scenes_body = { scenes: [], timestamp: 0 }.to_json

      cors = proc do |res|
        res['Access-Control-Allow-Origin'] = '*'
        res['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        res['Access-Control-Allow-Headers'] = 'Content-Type'
        # Chrome PNA/LNA: 공개 https 사이트(Vercel 배포)에서 localhost 브릿지 접근 허용
        res['Access-Control-Allow-Private-Network'] = 'true'
        res['Content-Type'] = 'application/json'
      end

      @local_server_thread = Thread.new do
        begin
          @local_server = WEBrick::HTTPServer.new(
            Port: @local_port,
            BindAddress: '0.0.0.0',
            Logger: WEBrick::Log.new(File::NULL), # /dev/null 하드코딩은 Windows에서 서버 기동 실패
            AccessLog: []
          )

          # 현재 캡처 데이터
          @local_server.mount_proc '/api/data' do |req, res|
            cors.call(res)
            if req.request_method == 'OPTIONS'
              res.status = 200
            else
              vp = begin
                v = Sketchup.active_model&.active_view
                sf = UI.respond_to?(:scale_factor) ? UI.scale_factor : 1.0
                # vpwidth/vpheight는 Mac에서 이미 물리 픽셀 - 배율을 다시 곱하지 않는다
                t = Sketchup.active_model&.title.to_s
                v ? { w: v.vpwidth, h: v.vpheight, sf: sf, title: (t.empty? ? nil : t) } : nil
              rescue StandardError
                nil
              end
              res.body = {
                source: @current_source_image,
                rendered: @current_image,
                viewport: vp,
                timestamp: Time.now.to_i
              }.to_json
            end
          end

          # 오브젝트 ID 마스크 (클릭 선택용): 이미지 + 색->재질 매핑
          @local_server.mount_proc '/api/mask' do |req, res|
            cors.call(res)
            if req.request_method == 'OPTIONS'
              res.status = 200
            else
              res.body = {
                mask: @bridge_mask_image,
                map: @bridge_mask_map || [],
                timestamp: @bridge_mask_time || 0
              }.to_json
            end
          end

          # 상태 확인
          @local_server.mount_proc '/api/ping' do |_req, res|
            cors.call(res)
            res.body = {
              status: 'ok', app: 'Lumanova Bridge',
              ip: local_ip, port: @local_port,
              sketchup: Sketchup.version
            }.to_json
          end

          # API Key 자동 전달 (신뢰된 출처만: 우리 앱/사이트)
          # 사용자가 앱에 키를 다시 입력할 필요를 없앤다
          @local_server.mount_proc '/api/apikey' do |req, res|
            origin = req['Origin'].to_s
            trusted = origin.empty? ||
                      origin == 'null' ||
                      origin.start_with?('http://localhost') ||
                      origin.start_with?('http://127.0.0.1') ||
                      origin == 'https://hyper-real-3vvh.vercel.app'
            cors.call(res)
            if req.request_method == 'OPTIONS'
              res.status = 200
            elsif trusted
              key = @config_store&.load_api_key
              res.body = { apiKey: key || '' }.to_json
            else
              res.status = 403
              res.body = { apiKey: '', error: 'origin not allowed' }.to_json
            end
          end

          # 씬 목록 (메인 스레드가 갱신한 캐시를 그대로 반환)
          @local_server.mount_proc '/api/scenes' do |_req, res|
            cors.call(res)
            res.body = @bridge_scenes_body
          end

          # 앱 → SketchUp 명령 (씬 전환, 카메라, 즉시 캡처)
          @local_server.mount_proc '/api/command' do |req, res|
            cors.call(res)
            if req.request_method == 'OPTIONS'
              res.status = 200
            elsif req.request_method == 'POST'
              begin
                cmd = JSON.parse(req.body.to_s)
                @bridge_mutex.synchronize { @bridge_commands << cmd }
                res.body = { accepted: true }.to_json
              rescue JSON::ParserError
                res.status = 400
                res.body = { accepted: false, error: 'invalid json' }.to_json
              end
            else
              res.status = 405
              res.body = { accepted: false, error: 'POST only' }.to_json
            end
          end

          # 앱 → SketchUp 렌더 결과 수신
          @local_server.mount_proc '/api/result' do |req, res|
            cors.call(res)
            if req.request_method == 'OPTIONS'
              res.status = 200
            elsif req.request_method == 'POST'
              begin
                data = JSON.parse(req.body.to_s)
                @web_received_result = data['image']
                puts "[NanoBanana] 브릿지: 렌더 결과 수신 (node=#{data['nodeId']})"
                res.body = { received: true }.to_json
              rescue JSON::ParserError
                res.status = 400
                res.body = { received: false, error: 'invalid json' }.to_json
              end
            else
              res.status = 405
              res.body = { received: false, error: 'POST only' }.to_json
            end
          end

          puts "[NanoBanana] 로컬 서버 시작: http://#{local_ip}:#{@local_port}"
          @local_server.start
        rescue StandardError => e
          puts "[NanoBanana] 로컬 서버 에러: #{e.message}"
        end
      end

      # 캡처 + 씬 목록 캐시 타이머 (0.5초마다, 메인 스레드)
      # 카메라가 실제로 움직였을 때만 캡처 -> 유휴 시 write_image 0회 (SketchUp 버벅임 방지)
      @web_sync_timer = UI.start_timer(0.5, true) do
        if @local_server
          capture_if_view_changed
          update_bridge_scenes
        end
      end

      # 명령 처리 타이머 (0.1초마다 — 씬 전환/카메라 반응속도)
      @bridge_command_timer = UI.start_timer(0.1, true) do
        process_bridge_commands if @local_server
      end

      "#{local_ip}:#{@local_port}"
    end

    # 뷰 변경을 허용된 컨텍스트(View Animation)에서 실행
    def run_on_view(on_done = nil, &block)
      Sketchup.active_model.active_view.animation = BridgeExec.new(on_done, &block)
    rescue StandardError => e
      puts "[NanoBanana] run_on_view 에러: #{e.message}"
    end

    # 앱에서 보낸 명령을 메인 스레드에서 실행
    def process_bridge_commands
      cmds = @bridge_mutex.synchronize do
        list = @bridge_commands.dup
        @bridge_commands.clear
        list
      end

      cmds.each do |cmd|
        begin
          case cmd['type']
          when 'select_scene'
            pages = Sketchup.active_model.pages
            page = pages[cmd['name'].to_s]
            if page
              name = cmd['name'].to_s
              run_on_view(proc { capture_now_and_sync }) do
                # 전환 애니메이션(수 초) 없이 즉시 점프
                opts = Sketchup.active_model.options['PageOptions']
                prev_show = opts ? opts['ShowTransition'] : nil
                opts['ShowTransition'] = false if opts
                begin
                  pages.selected_page = page
                  # selected_page=가 무시되는 환경 대비: 씬 카메라를 직접 적용
                  if page.use_camera? && page.camera
                    view = Sketchup.active_model.active_view
                    view.camera.set(page.camera.eye, page.camera.target, page.camera.up)
                    view.camera.perspective = page.camera.perspective?
                    view.camera.fov = page.camera.fov if page.camera.perspective?
                  end
                ensure
                  opts['ShowTransition'] = prev_show if opts && !prev_show.nil?
                end
                Sketchup.active_model.active_view.invalidate
              end
              @bridge_scene_override = name
              puts "[NanoBanana] 브릿지: 씬 전환 -> #{name}"
            end
          when 'camera'
            action = cmd['action']
            value = cmd['value'].to_s
            run_on_view(proc { capture_now_and_sync }) do
              case action
              when 'move' then camera_move(value)
              when 'rotate' then camera_rotate(value)
              when 'height' then camera_set_height(value)
              when 'fov' then camera_set_fov(value)
              when 'two_point' then apply_two_point_perspective
              end
            end
            # 캡처는 변경 적용 완료 콜백(run_on_view on_done)이 수행
          when 'capture'
            capture_current_view(cmd['size'])
          when 'add_scene'
            add_scene
            update_bridge_scenes
          when 'capture_mask'
            capture_id_mask
          end
        rescue StandardError => e
          puts "[NanoBanana] 브릿지 명령 에러(#{cmd['type']}): #{e.message}"
        end
      end
    end

    # 씬 목록 캐시 갱신 (메인 스레드 전용)
    def update_bridge_scenes
      model = Sketchup.active_model
      return unless model

      pages = model.pages
      native = pages.selected_page&.name
      # SketchUp 쪽에서 씬이 직접 바뀌면 오버라이드 해제
      if @bridge_prev_native && native != @bridge_prev_native
        @bridge_scene_override = nil
      end
      @bridge_prev_native = native
      selected = @bridge_scene_override || native
      scenes = pages.map { |p| { name: p.name, active: p.name == selected } }
      @bridge_scenes_body = { scenes: scenes, timestamp: Time.now.to_i }.to_json
    rescue StandardError => e
      puts "[NanoBanana] 씬 캐시 에러: #{e.message}"
    end

    def stop_local_server
      if @bridge_command_timer
        UI.stop_timer(@bridge_command_timer)
        @bridge_command_timer = nil
      end

      if @web_sync_timer
        UI.stop_timer(@web_sync_timer)
        @web_sync_timer = nil
      end

      if @local_server
        @local_server.shutdown
        @local_server = nil
      end

      if @local_server_thread
        @local_server_thread.kill
        @local_server_thread = nil
      end

      puts "[NanoBanana] 로컬 서버 중지"
    end

    # 오브젝트 ID 마스크 캡처 (태그별 색상 - 즉시/무변경)
    def capture_id_mask
      model = Sketchup.active_model
      return unless model

      view = model.active_view
      ro = model.rendering_options
      # 태그별 색상 표시 모드: 즉시 전환 (재질 색칠 방식은 대형 모델에서 수 분 프리즈)
      # SketchUp 기본 태그색은 서로 겹치므로 캡처 순간에만 고유색을 입히고 원색으로 복원
      saved = {}
      orig_colors = []
      begin
        { 'DisplayColorByLayer' => true, 'Texture' => false,
          'DisplayShadows' => false, 'EdgeDisplayMode' => 0 }.each do |k, v|
          begin
            saved[k] = ro[k]
            ro[k] = v
          rescue StandardError
          end
        end

        map = []
        model.layers.each_with_index do |l, i|
          c = l.color
          orig_colors << [l, Sketchup::Color.new(c.red, c.green, c.blue, c.alpha)]
          # 황금각 색상환: 태그 수와 무관하게 서로 뚜렷이 구분되는 고유색 (흰/검/하늘색 회피)
          hue = (i * 137.508) % 360.0
          sat = 0.85 - 0.25 * ((i / 3) % 2)
          val = 0.95 - 0.30 * ((i / 2) % 2)
          r, g, b = hsv_to_rgb(hue, sat, val)
          l.color = Sketchup::Color.new(r, g, b)
          map << { color: format('#%02x%02x%02x', r, g, b), material: l.name == 'Layer0' ? '기본' : l.name }
        end

        temp_path = File.join(Dir.tmpdir, 'lumanova_mask.png')
        view.write_image(filename: temp_path, width: 960, height: 540, antialias: false, transparent: false)
        @bridge_mask_image = Base64.strict_encode64(File.binread(temp_path))
        @bridge_mask_map = map
        @bridge_mask_time = Time.now.to_i
        puts "[NanoBanana] ID 마스크 캡처 완료 (태그 #{map.length}개)"
      rescue StandardError => e
        puts "[NanoBanana] 마스크 캡처 에러: #{e.message}"
      ensure
        orig_colors.each { |l, c| l.color = c rescue nil }
        saved.each { |k, v| ro[k] = v rescue nil }
        view.invalidate
      end
    end

    # HSV -> RGB (0~255 정수)
    def hsv_to_rgb(h, s, v)
      c = v * s
      x = c * (1 - ((h / 60.0) % 2 - 1).abs)
      m = v - c
      r1, g1, b1 =
        case h
        when 0...60   then [c, x, 0]
        when 60...120 then [x, c, 0]
        when 120...180 then [0, c, x]
        when 180...240 then [0, x, c]
        when 240...300 then [x, 0, c]
        else [c, 0, x]
        end
      [((r1 + m) * 255).round, ((g1 + m) * 255).round, ((b1 + m) * 255).round]
    end

    # 명령 직후: 즉시 캡처하고 변경감지 상태 동기화 (이중 캡처 방지)
    def capture_now_and_sync
      capture_current_view
      cam = Sketchup.active_model&.active_view&.camera
      if cam
        @bridge_cam_sig = [cam.eye.to_a, cam.target.to_a, cam.up.to_a, cam.perspective? ? cam.fov : 0]
      end
      @bridge_view_moved = false
      update_bridge_scenes
    rescue StandardError => e
      puts "[NanoBanana] 즉시 캡처 에러: #{e.message}"
    end

    # 카메라가 '멈춘 직후' 1회만 캡처 (움직이는 동안 무거운 캡처 중첩 방지)
    def capture_if_view_changed
      model = Sketchup.active_model
      return unless model

      cam = model.active_view.camera
      sig = [cam.eye.to_a, cam.target.to_a, cam.up.to_a, cam.perspective? ? cam.fov : 0]

      if sig != @bridge_cam_sig
        @bridge_cam_sig = sig
        @bridge_view_moved = true # 움직이는 중 - 캡처 보류
        return
      end

      if @bridge_view_moved
        @bridge_view_moved = false
        capture_current_view
      end
    rescue StandardError => e
      puts "[NanoBanana] 뷰 변경 감지 에러: #{e.message}"
    end

    def capture_current_view(size = nil)
      return unless @local_server

      begin
        # size 지정 시 고품질 캡처 (Convert), 미지정 시 미러링용 기본 해상도
        dims = { '1024' => [1024, 576], '1536' => [1536, 864], '1920' => [1920, 1080] }[size.to_s]
        w, h = dims || [960, 540]
        model = Sketchup.active_model
        return unless model

        view = model.active_view
        temp_path = File.join(Dir.tmpdir, 'nanobanana_live.jpg')
        view.write_image(
          filename: temp_path,
          width: w,
          height: h,
          antialias: !dims.nil?, # 미러는 속도 우선, Convert(고품질)만 안티앨리어싱
          transparent: false,
          compression: dims ? 0.85 : 0.75
        )

        if File.exist?(temp_path)
          @current_source_image = Base64.strict_encode64(File.binread(temp_path))
        end
      rescue StandardError => e
        # 조용히 실패
      end
    end

    # 하위 호환성
    def start_web_sync
      addr = start_local_server
      @main_dialog&.execute_script("onWebSyncStarted('#{addr}')")
      addr
    end

    def stop_web_sync
      stop_local_server
      @main_dialog&.execute_script("onWebSyncStopped()")
    end

    def sync_rendered_to_web
      # 로컬 서버에서는 @current_image가 자동으로 공유됨
    end
  end
end
