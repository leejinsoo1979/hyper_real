# frozen_string_literal: true

# NanoBanana Renderer - 렌더링 엔진
# 씬 캡처, 분석, 렌더링 실행 (일반 + 병렬)

module NanoBanana
  class << self
    # ========================================
    # 씬 캡처
    # ========================================

    # 씬 캡처 + AI 프롬프트 생성 (Convert)
    def capture_scene(size = '1024')
      begin
        temp_path = File.join(Dir.tmpdir, 'nanobanana_capture.jpg')
        model = Sketchup.active_model
        view = model.active_view
        rendering_options = model.rendering_options

        # ★★★ 핵심: 캡처 전 Edge(윤곽선) 끄기 ★★★
        original_edges = rendering_options["DrawEdges"]
        original_profiles = rendering_options["DrawProfileEdges"] rescue nil
        original_depth_cue = rendering_options["DrawDepthQue"] rescue nil
        original_extension = rendering_options["ExtendLines"] rescue nil

        # Edge 관련 모든 설정 OFF
        rendering_options["DrawEdges"] = false
        rendering_options["DrawProfileEdges"] = false rescue nil
        rendering_options["DrawDepthQue"] = false rescue nil
        rendering_options["ExtendLines"] = false rescue nil

        puts "[NanoBanana] Edge OFF 설정 완료 (원본: #{original_edges})"

        # 해상도 설정. SketchUp write_image가 병목이라 기본값은 빠른 프리뷰 우선.
        sizes = {
          '1024' => { width: 1024, height: 576 },    # 속도
          '1536' => { width: 1536, height: 864 },    # 밸런스
          '1920' => { width: 1920, height: 1080 }    # 고품질
        }
        resolution = sizes[size] || sizes['1024']

        # JPEG으로 압축 (PNG 대비 70% 용량 감소)
        keys = {
          :filename => temp_path,
          :width => resolution[:width],
          :height => resolution[:height],
          :antialias => true,
          :transparent => false,
          :compression => 0.85  # JPEG 품질 85%
        }

        success = view.write_image(keys)

        # ★★★ 캡처 후 원래 Edge 설정 복원 ★★★
        rendering_options["DrawEdges"] = original_edges
        rendering_options["DrawProfileEdges"] = original_profiles rescue nil
        rendering_options["DrawDepthQue"] = original_depth_cue rescue nil
        rendering_options["ExtendLines"] = original_extension rescue nil

        puts "[NanoBanana] Edge 설정 복원 완료"

        unless success
          raise "이미지 내보내기 실패"
        end

        @current_image = Base64.strict_encode64(File.binread(temp_path))
        @current_image_is_preview = false
        file_size_kb = File.size(temp_path) / 1024
        File.delete(temp_path) rescue nil

        # ★ 아이소메트릭(orthographic) 뷰 감지
        camera = view.camera
        @is_isometric = !camera.perspective?
        puts "[NanoBanana] 카메라 모드: #{@is_isometric ? 'Isometric (Orthographic)' : 'Perspective'}"

        puts "[NanoBanana] 캡처 완료 (#{resolution[:width]}x#{resolution[:height]}, #{file_size_kb}KB, Edge OFF)"

        # UI에 캡처 완료 알림
        if @main_dialog
          @main_dialog.execute_script("onCaptureComplete('#{@current_image}', 0)")
          @main_dialog.execute_script("onConvertComplete('')")
          @main_dialog.execute_script("setStatus('Convert 완료 - Auto로 프롬프트 생성하세요')")
        end

      rescue StandardError => e
        # 에러 발생해도 Edge 복원 시도
        rendering_options["DrawEdges"] = original_edges rescue nil
        puts "[NanoBanana] 캡처 에러: #{e.message}"
        puts e.backtrace.first(5).join("\n")
        if @main_dialog
          @main_dialog.execute_script("onCaptureError('#{e.message}')")
        end
      end
    end

    # 씬 분석 - 재질/구조 데이터만 추출 (프롬프트 생성 X)
    def analyze_scene_only
      unless @api_client
        puts "[NanoBanana] API 클라이언트 없음 - 분석 스킵"
        @scene_analysis = nil
        @main_dialog&.execute_script("onConvertComplete('')")
        return
      end

      Thread.new do
        begin
          analysis_prompt = <<~PROMPT
Analyze this SketchUp interior/architecture image and extract ONLY the following data in JSON format.
Do NOT generate any rendering prompt. Output ONLY valid JSON.

{
  "space_type": "거실/침실/주방/사무실/etc",
  "layout": {
    "description": "공간 구성 설명",
    "walls": ["좌측벽 특징", "우측벽 특징", "후면벽 특징"],
    "windows": ["창문1 위치/크기", "창문2 위치/크기"],
    "doors": ["문1 위치"]
  },
  "materials": {
    "floor": {"type": "재질명", "color": "색상", "pattern": "패턴"},
    "ceiling": {"type": "재질명", "color": "색상"},
    "walls": [{"location": "위치", "type": "재질명", "color": "색상"}]
  },
  "furniture": [
    {"name": "가구명", "position": "위치", "material": "재질", "color": "색상"}
  ],
  "lighting": [
    {"type": "조명종류", "position": "위치", "count": 개수}
  ],
  "style": "모던/클래식/미니멀/etc"
}
          PROMPT

          puts "[NanoBanana] 씬 분석 시작 (데이터 추출만)..."

          @main_dialog&.execute_script("updateConvertProgress('이미지 캡처 완료', '공간 구조 분석 중...')")
          sleep(0.3)

          @main_dialog&.execute_script("updateConvertProgress('AI 분석 요청', '재질 및 색상 데이터 추출 중...')")

          # Gemini에게 이미지 분석 요청
          result = @api_client.analyze_scene(@current_image, analysis_prompt)

          @main_dialog&.execute_script("updateConvertProgress('AI 응답 수신', '데이터 처리 중...')")

          if result && result[:text]
            @scene_analysis = result[:text]
            puts "[NanoBanana] 씬 분석 완료"
            puts @scene_analysis[0..300] + "..."

            # Convert 완료 - 프롬프트는 비워두고 활성화만
            @main_dialog&.execute_script("onConvertComplete('')")
          else
            puts "[NanoBanana] 씬 분석 실패"
            @scene_analysis = nil
            @main_dialog&.execute_script("onConvertError('씬 분석 실패')")
          end

        rescue StandardError => e
          puts "[NanoBanana] 씬 분석 에러: #{e.message}"
          @scene_analysis = nil
          @main_dialog&.execute_script("onConvertError(#{e.message.to_json})")
        end
      end
    end

    # ========================================
    # 렌더링 실행
    # ========================================

    # 렌더링 시작 (새 UI용 - time preset + light switch)
    def start_render_with_preset(time_preset, light_switch)
      puts "[NanoBanana] ========== 렌더링 시작 =========="
      puts "[NanoBanana] 엔진: #{@current_api}, time=#{time_preset}, light=#{light_switch}"

      # 엔진에 따라 클라이언트 확인
      if @current_api == 'replicate'
        unless @replicate_client
          UI.messagebox('Replicate API Token이 설정되지 않았습니다.', MB_OK)
          return
        end
      else
        unless @api_client
          UI.messagebox('Gemini API Key가 설정되지 않았습니다.', MB_OK)
          return
        end
      end

      unless @current_image
        UI.messagebox('먼저 씬을 캡처하세요.', MB_OK)
        return
      end

      # 소스가 씬 탭용 저해상 프리뷰면 고품질로 재캡처 (자글자글 렌더 방지)
      if @current_image_is_preview
        puts "[NanoBanana] 소스가 저해상 프리뷰 - 고품질 재캡처 실행"
        capture_scene('1024')
      end

      # 현재 씬 이름 가져오기
      model = Sketchup.active_model
      current_scene = model.pages.selected_page&.name || 'Unknown'

      # 렌더링 시작 시 현재 이미지를 별도로 복사 (다른 씬 작업해도 영향 없음)
      puts "[NanoBanana] 이미지 복사 시작..."
      render_source_image = @current_image.dup
      puts "[NanoBanana] 이미지 복사 완료: #{render_source_image.length} bytes"

      # UI에 렌더링 시작 알림 (씬 이름 포함)
      puts "[NanoBanana] UI 알림 전송 중..."
      @main_dialog&.execute_script("onRenderStart('#{current_scene}')")
      puts "[NanoBanana] UI 알림 완료"
      puts "[NanoBanana] 렌더링 시작 (동기 모드)..."

      # Thread 없이 직접 실행 (SketchUp Ruby Thread 문제 회피)
      begin
        render_start = Time.now
        # 시간대와 조명 설정으로 프롬프트 생성
        prompt = build_render_prompt(time_preset, light_switch)
        negative = @negative_prompt || 'cartoon, anime, sketch, drawing, wireframe, outline, black lines, CGI, 3D render'

        puts "[NanoBanana] Prompt: #{prompt[0..200]}..."
        puts "[NanoBanana] 렌더링 씬: #{current_scene}"
        puts "[NanoBanana] 이미지 크기: #{render_source_image.length} bytes"

        # ★★★ 엔진에 따라 API 호출 분기 ★★★
        result = if @current_api == 'replicate'
          puts "[NanoBanana] Replicate API 사용 (ControlNet)"
          @replicate_client.generate(render_source_image, prompt, negative)
        elsif @reference_image
          puts "[NanoBanana] Gemini API + 레퍼런스 이미지"
          @api_client.generate_with_references(render_source_image, [@reference_image], prompt)
        else
          puts "[NanoBanana] Gemini API 사용"
          @api_client.generate(render_source_image, prompt)
        end

        render_elapsed = (Time.now - render_start).round(1)
        puts "[NanoBanana] 렌더링 총 소요시간: #{render_elapsed}초"

        if result && result[:image]
          # 렌더링 결과를 저장 (Export 기능에서 사용)
          @current_image = result[:image]
          # 렌더링 완료 (씬 이름과 함께 전달)
          @main_dialog&.execute_script("onRenderComplete('#{result[:image]}', '#{current_scene}')")
          # 웹 동기화 전송
          sync_rendered_to_web if @web_sync_active
        else
          @main_dialog&.execute_script("onRenderError('렌더링 결과를 받지 못했습니다.', '#{current_scene}')")
        end
      rescue StandardError => e
        puts "[NanoBanana] Render Error: #{e.message}"
        puts e.backtrace.first(5).join("\n")
        @main_dialog&.execute_script("onRenderError(#{e.message.to_json}, #{current_scene.to_s.to_json})")
      end
    end

    # 노드 에디터 렌더링 (동기 모드 — SketchUp Ruby Thread 문제 회피)
    def start_render_parallel(time_preset, light_switch, render_id, user_prompt = '', user_negative = '', engine = '')
      puts "[NanoBanana] ========== 노드 렌더링 시작 (#{render_id}) =========="

      unless @api_client
        @main_dialog&.execute_script("onNodeRenderError('#{render_id}', 'API Key가 설정되지 않았습니다.')")
        return
      end

      unless @current_image
        @main_dialog&.execute_script("onNodeRenderError('#{render_id}', '먼저 씬을 캡처하세요.')")
        return
      end

      # 노드에서 선택한 모델로 임시 변경
      saved_model = @api_client.model
      if engine && !engine.empty? && engine != 'main'
        mapped = ApiClient::IMAGE_GEN_MODELS[engine] || engine
        @api_client.model = mapped
        puts "[NanoBanana] [#{render_id}] 모델 변경: #{saved_model} → #{mapped} (요청: #{engine})"
      end

      render_source_image = @current_image.dup
      prompt = if user_prompt && !user_prompt.empty?
        user_prompt
      else
        build_render_prompt(time_preset, light_switch)
      end
      negative = if user_negative && !user_negative.empty?
        user_negative
      else
        'cartoon, anime, sketch, drawing, wireframe, outline, black lines, CGI, 3D render'
      end

      puts "[NanoBanana] [#{render_id}] Prompt: #{prompt[0..150]}..."
      puts "[NanoBanana] [#{render_id}] 이미지 크기: #{render_source_image.length} bytes"
      puts "[NanoBanana] [#{render_id}] 사용 모델: #{@api_client.model}"
      puts "[NanoBanana] [#{render_id}] 동기 모드 렌더링 시작..."

      # Thread 없이 직접 실행 (SketchUp Ruby Thread 문제 회피 — start_render_with_preset과 동일 방식)
      begin
        render_start = Time.now

        result = if @current_api == 'replicate' && @replicate_client
          puts "[NanoBanana] [#{render_id}] Replicate API 사용"
          @replicate_client.generate(render_source_image, prompt, negative)
        elsif @reference_image
          puts "[NanoBanana] [#{render_id}] Gemini API + 레퍼런스 이미지"
          @api_client.generate_with_references(render_source_image, [@reference_image], prompt)
        else
          puts "[NanoBanana] [#{render_id}] Gemini API 사용"
          @api_client.generate(render_source_image, prompt)
        end

        render_elapsed = (Time.now - render_start).round(1)
        puts "[NanoBanana] [#{render_id}] 렌더링 완료: #{render_elapsed}초"

        if result && result[:image]
          image_base64 = result[:image]
          puts "[NanoBanana] [#{render_id}] 결과 전송: #{image_base64.length} bytes"
          @main_dialog&.execute_script("onNodeRenderComplete('#{render_id}', '#{image_base64}')")
        else
          puts "[NanoBanana] [#{render_id}] 결과 없음"
          @main_dialog&.execute_script("onNodeRenderError('#{render_id}', '렌더링 결과를 받지 못했습니다.')")
        end
      rescue StandardError => e
        puts "[NanoBanana] [#{render_id}] Render Error: #{e.message}"
        puts e.backtrace.first(5).join("\n")
        @main_dialog&.execute_script("onNodeRenderError('#{render_id}', #{e.message.to_json})")
      ensure
        # 모델 원래대로 복원
        @api_client.model = saved_model if saved_model && @api_client
      end
    end
  end
end
