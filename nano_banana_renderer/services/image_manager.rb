# frozen_string_literal: true

# NanoBanana Renderer - 이미지 및 히스토리 관리
# 이미지 저장, 히스토리, 파일명 생성, 2차 생성

module NanoBanana
  class << self
    # ========================================
    # 히스토리 관리
    # ========================================

    # 히스토리 파일에 저장
    def save_history_to_file(history_json)
      begin
        FileUtils.mkdir_p(HISTORY_DIR) unless File.directory?(HISTORY_DIR)
        history = JSON.parse(history_json)
        history = history.slice(0, MAX_HISTORY_ITEMS) if history.length > MAX_HISTORY_ITEMS
        File.write(HISTORY_FILE, JSON.pretty_generate(history))
        puts "[SketchupShow] 히스토리 저장 완료: #{history.length}개"
      rescue StandardError => e
        puts "[SketchupShow] 히스토리 저장 실패: #{e.message}"
      end
    end

    # 히스토리 파일에서 로드
    def load_history_from_file
      begin
        if File.exist?(HISTORY_FILE)
          history_json = File.read(HISTORY_FILE)
          history = JSON.parse(history_json)
          puts "[SketchupShow] 히스토리 로드: #{history.length}개"
          @main_dialog&.execute_script("onHistoryLoaded(#{history.to_json})")
        else
          puts "[SketchupShow] 히스토리 파일 없음"
          @main_dialog&.execute_script("onHistoryLoaded([])")
        end
      rescue StandardError => e
        puts "[SketchupShow] 히스토리 로드 실패: #{e.message}"
        @main_dialog&.execute_script("onHistoryLoaded([])")
      end
    end

    # ========================================
    # 이미지 저장
    # ========================================

    def save_image(filename)
      puts "[NanoBanana] save_image 호출됨, filename: #{filename}"
      puts "[NanoBanana] @current_image 존재: #{@current_image ? '있음 (' + @current_image.length.to_s + ' bytes)' : '없음'}"

      unless @current_image
        puts "[NanoBanana] 저장할 이미지가 없습니다"
        @main_dialog&.execute_script("setStatus('No image to save')")
        return
      end

      # 설정에서 저장 경로 및 파일명 형식 로드
      settings = @config_store.load_all_settings
      download_path = settings['download_path']
      filename_format = settings['filename_format'] || 'timestamp'

      # 저장 경로 결정
      if download_path && Dir.exist?(download_path)
        default_dir = download_path
      else
        model = Sketchup.active_model
        model_path = model.path

        if model_path.empty?
          default_dir = File.expand_path('~/Desktop')
        else
          default_dir = File.join(File.dirname(model_path), 'NanoBanana_Renders')
          Dir.mkdir(default_dir) unless Dir.exist?(default_dir)
        end
      end

      # 파일명 생성
      if filename.empty?
        default_filename = generate_filename(filename_format)
      else
        default_filename = filename
      end

      save_path = UI.savepanel('이미지 저장', default_dir, default_filename)
      return unless save_path

      # .png 확장자 확인
      save_path += '.png' unless save_path.downcase.end_with?('.png')

      begin
        # Base64 디코딩 후 저장
        image_data = Base64.decode64(@current_image)
        File.binwrite(save_path, image_data)
        puts "[NanoBanana] 이미지 저장 완료: #{save_path}"
        # UI 상태바에만 표시
        @main_dialog&.execute_script("setStatus('Saved: #{File.basename(save_path)}')")
      rescue StandardError => e
        puts "[NanoBanana] 저장 실패: #{e.message}"
        @main_dialog&.execute_script("setStatus('Save failed')")
      end
    end

    # 파일명 생성
    def generate_filename(format)
      case format
      when 'timestamp'
        "render_#{Time.now.strftime('%Y%m%d_%H%M%S')}.png"
      when 'scene'
        model = Sketchup.active_model
        page = model.pages.selected_page
        scene_name = page ? page.name.gsub(/[^a-zA-Z0-9가-힣_-]/, '_') : 'untitled'
        "#{scene_name}_render.png"
      when 'sequential'
        # 저장 폴더에서 기존 파일 수 확인
        settings = @config_store.load_all_settings
        dir = settings['download_path'] || File.expand_path('~/Desktop')
        existing = Dir.glob(File.join(dir, 'render_*.png')).length
        "render_#{format('%03d', existing + 1)}.png"
      else
        "render_#{Time.now.strftime('%Y%m%d_%H%M%S')}.png"
      end
    end

    # 편집된 이미지 저장 (에디터에서 호출)
    def save_edited_image(image_base64)
      # 설정에서 저장 경로 로드
      settings = @config_store.load_all_settings
      download_path = settings['download_path']
      filename_format = settings['filename_format'] || 'timestamp'

      # 저장 경로 결정
      if download_path && Dir.exist?(download_path)
        default_dir = download_path
      else
        default_dir = File.expand_path('~/Desktop')
      end

      default_filename = generate_filename(filename_format).sub('render_', 'edited_')

      save_path = UI.savepanel('보정 이미지 저장', default_dir, default_filename)
      return unless save_path

      save_path += '.png' unless save_path.downcase.end_with?('.png')

      begin
        image_data = Base64.decode64(image_base64)
        File.binwrite(save_path, image_data)
        puts "[NanoBanana] 보정 이미지 저장 완료: #{save_path}"
        @editor_dialog&.execute_script("alert('저장 완료: #{File.basename(save_path)}')")
      rescue StandardError => e
        puts "[NanoBanana] 저장 실패: #{e.message}"
        @editor_dialog&.execute_script("alert('저장 실패: #{e.message}')")
      end
    end

    # ========================================
    # 2차 생성 (이전 결과를 소스로 재생성)
    # panel_id: 숫자 문자열(렌더모드) 또는 'inpaint_X'/'node_X'(노드에디터)
    # ========================================
    def regenerate_image(source_base64, prompt, panel_id)
      unless @api_client
        _regen_callback(panel_id, false, 'API Key가 설정되지 않았습니다.')
        return
      end

      # 노드에디터 콜백인지 판별
      is_node_callback = panel_id.to_s.match?(/^(inpaint_|node_)/)

      Thread.new do
        begin
          puts "[NanoBanana] 2차 생성 시작 (#{panel_id})"

          # 인페인팅은 프롬프트를 그대로 사용 (JS에서 이미 조합됨)
          render_prompt = if is_node_callback
            prompt
          elsif prompt && !prompt.empty?
            <<~PROMPT
★★★ IMAGE REFINEMENT REQUEST ★★★
Based on the attached rendered image, apply the following modifications while preserving the overall composition.

User Instructions: #{prompt}

CRITICAL RULES:
- PRESERVE the exact camera angle, perspective, and framing
- PRESERVE the spatial layout and furniture positions
- Apply requested modifications seamlessly
- Maintain photorealistic quality with consistent lighting
- DO NOT add elements that weren't requested
- DO NOT remove elements unless specifically requested
            PROMPT
          else
            <<~PROMPT
★★★ IMAGE ENHANCEMENT REQUEST ★★★
Enhance the attached rendered image while preserving all elements.

Improvements to apply:
- Enhance material textures and realism
- Improve lighting quality and shadow definition
- Increase overall photorealistic quality
- Refine details without changing the composition

CRITICAL RULES:
- PRESERVE the exact camera angle and composition
- PRESERVE all furniture positions and materials
- PRESERVE color tones (do not shift colors)
- DO NOT add or remove any objects
            PROMPT
          end

          puts "[NanoBanana] 2차 생성 프롬프트: #{render_prompt[0..200]}..."

          result = @api_client.generate(source_base64, render_prompt)

          if result && result[:image]
            _regen_callback(panel_id, true, result[:image])
            puts "[NanoBanana] 2차 생성 완료 (#{panel_id})"
          else
            _regen_callback(panel_id, false, '결과를 받지 못했습니다.')
          end
        rescue StandardError => e
          puts "[NanoBanana] 2차 생성 에러: #{e.message}"
          _regen_callback(panel_id, false, e.message.tr("'", '"').gsub("\n", ' '))
        end
      end
    end

    private

    # regenerate 결과 콜백 라우팅
    def _regen_callback(panel_id, success, data)
      pid = panel_id.to_s
      if pid.match?(/^(inpaint_|node_)/)
        # 노드에디터 콜백
        if success
          js = "if(window._nodeRendererCallbacks&&window._nodeRendererCallbacks['#{pid}']){window._nodeRendererCallbacks['#{pid}']({success:true,image:'#{data}'})}"
        else
          js = "if(window._nodeRendererCallbacks&&window._nodeRendererCallbacks['#{pid}']){window._nodeRendererCallbacks['#{pid}']({success:false,error:'#{data}'})}"
        end
        UI.start_timer(0) { @main_dialog&.execute_script(js) }
      else
        # 렌더모드 콜백
        if success
          UI.start_timer(0) { @main_dialog&.execute_script("onRegenerateComplete('#{data}', #{pid})") }
        else
          UI.start_timer(0) { @main_dialog&.execute_script("onRegenerateError('#{data}', #{pid})") }
        end
      end
    end
  end
end
