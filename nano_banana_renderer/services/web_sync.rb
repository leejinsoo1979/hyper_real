# frozen_string_literal: true

# NanoBanana Renderer - 웹 동기화
# 로컬 WEBrick 서버, 동기화 기능

module NanoBanana
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

      @local_server_thread = Thread.new do
        begin
          @local_server = WEBrick::HTTPServer.new(
            Port: @local_port,
            BindAddress: '0.0.0.0',
            Logger: WEBrick::Log.new("/dev/null"),
            AccessLog: []
          )

          # CORS 및 데이터 API
          @local_server.mount_proc '/api/data' do |req, res|
            res['Access-Control-Allow-Origin'] = '*'
            res['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
            res['Access-Control-Allow-Headers'] = 'Content-Type'
            res['Content-Type'] = 'application/json'

            if req.request_method == 'OPTIONS'
              res.status = 200
            else
              res.body = {
                source: @current_source_image,
                rendered: @current_image,
                timestamp: Time.now.to_i
              }.to_json
            end
          end

          # 상태 확인 API
          @local_server.mount_proc '/api/ping' do |req, res|
            res['Access-Control-Allow-Origin'] = '*'
            res['Content-Type'] = 'application/json'
            res.body = { status: 'ok', app: 'BananaShow', ip: local_ip, port: @local_port }.to_json
          end

          puts "[NanoBanana] 로컬 서버 시작: http://#{local_ip}:#{@local_port}"
          @local_server.start
        rescue StandardError => e
          puts "[NanoBanana] 로컬 서버 에러: #{e.message}"
        end
      end

      # 캡처 타이머 시작 (1초마다)
      @web_sync_timer = UI.start_timer(1, true) do
        capture_current_view if @local_server
      end

      "#{local_ip}:#{@local_port}"
    end

    def stop_local_server
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

    def capture_current_view
      return unless @local_server

      begin
        view = Sketchup.active_model.active_view
        temp_path = File.join(Dir.tmpdir, 'nanobanana_live.png')
        view.write_image(temp_path, 1280, 720, true)

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
