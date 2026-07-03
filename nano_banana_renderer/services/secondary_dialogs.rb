# frozen_string_literal: true

# NanoBanana Renderer - 보조 다이얼로그
# 설정, 에디터, 핫스팟, 프롬프트, Mix 다이얼로그 + 콜백

module NanoBanana
  class << self
    # ========================================
    # 설정 다이얼로그
    # ========================================
    def show_settings_dialog
      if @settings_dialog && @settings_dialog.visible?
        @settings_dialog.bring_to_front
        return
      end

      options = {
        dialog_title: '설정 - NanoBanana',
        preferences_key: 'NanoBanana_SettingsDialog',
        width: 450,
        height: 400,
        min_width: 400,
        min_height: 350,
        resizable: false
      }

      @settings_dialog = UI::HtmlDialog.new(options)
      @settings_dialog.set_file(File.join(PLUGIN_ROOT, 'ui/settings_dialog.html'))

      register_settings_callbacks(@settings_dialog)

      @settings_dialog.show
    end

    def register_settings_callbacks(dialog)
      dialog.add_action_callback('save_api_key') do |_ctx, key|
        save_api_key(key)
      end

      dialog.add_action_callback('load_api_key') do |_ctx|
        load_api_key_to_dialog
      end

      dialog.add_action_callback('save_model') do |_ctx, model|
        save_model(model)
      end

      dialog.add_action_callback('load_model') do |_ctx|
        load_model_to_dialog
      end

      dialog.add_action_callback('test_connection') do |_ctx|
        test_api_connection
      end

      dialog.add_action_callback('browse_download_folder') do |_ctx|
        folder = UI.select_directory(title: '다운로드 폴더 선택')
        if folder
          dialog.execute_script("onFolderSelected('#{folder.gsub("'", "\\\\'")}')")
        end
      end

      dialog.add_action_callback('save_settings') do |_ctx, settings_json|
        begin
          settings = JSON.parse(settings_json)
          @config_store.save_settings(settings)
        rescue StandardError => e
          puts "[NanoBanana] 설정 저장 오류: #{e.message}"
        end
      end

      dialog.add_action_callback('load_settings') do |_ctx|
        settings = @config_store.load_all_settings
        if settings
          dialog.execute_script("onSettingsLoaded(#{settings.to_json})")
        end
      end

      dialog.add_action_callback('close_dialog') do |_ctx|
        @settings_dialog.close
      end
    end

    # ========================================
    # 편집 다이얼로그
    # ========================================
    def show_editor_dialog
      return unless @current_image

      if @editor_dialog && @editor_dialog.visible?
        @editor_dialog.bring_to_front
        return
      end

      options = {
        dialog_title: '이미지 보정 - NanoBanana',
        preferences_key: 'NanoBanana_EditorDialog',
        width: 900,
        height: 650,
        min_width: 800,
        min_height: 600,
        resizable: true
      }

      @editor_dialog = UI::HtmlDialog.new(options)
      @editor_dialog.set_file(File.join(PLUGIN_ROOT, 'ui/editor_dialog.html'))

      register_editor_callbacks(@editor_dialog)

      @editor_dialog.show
    end

    def register_editor_callbacks(dialog)
      dialog.add_action_callback('editor_ready') do |_ctx|
        dialog.execute_script("loadImage('#{@current_image}')")
      end

      dialog.add_action_callback('apply_adjustments') do |_ctx, image_base64|
        @current_image = image_base64
        @main_dialog&.execute_script("updatePreviewImage('#{image_base64}')")
        dialog.close
      end

      dialog.add_action_callback('save_edited_image') do |_ctx, image_base64|
        save_edited_image(image_base64)
      end

      dialog.add_action_callback('editor_generate_ai') do |_ctx, data_json|
        editor_generate_ai(data_json)
      end

      dialog.add_action_callback('cancel_edit') do |_ctx|
        dialog.close
      end
    end

    # 에디터에서 AI 이미지 재생성
    def editor_generate_ai(data_json)
      unless @api_client
        @editor_dialog&.execute_script("onAIGenerateError('API Key가 설정되지 않았습니다.')")
        return
      end

      begin
        data = JSON.parse(data_json)
        base_image = data['baseImage']
        reference_image = data['referenceImage']
        user_prompt = data['prompt'] || ''
        texture_intensity = data['textureIntensity'] || 'med'

        Thread.new do
          begin
            # 텍스처 강도 설명
            texture_desc = case texture_intensity
            when 'low'
              "Low texture detail - smoother, more simplified surfaces"
            when 'high'
              "High texture detail - rich, detailed surface textures with visible grain and patterns"
            else
              "Medium texture detail - balanced realistic textures"
            end

            # 프롬프트 구성
            prompt = <<~PROMPT
★★★ IMAGE REFINEMENT REQUEST ★★★
Using the provided base image as the primary reference, apply the following modifications:

User Instructions: #{user_prompt.empty? ? 'Enhance the image quality and realism' : user_prompt}

Texture Setting: #{texture_desc}

#{reference_image ? 'A reference image is provided - incorporate its style, colors, or elements as specified in the user instructions.' : ''}

CRITICAL RULES:
- PRESERVE the exact camera angle, composition, and perspective
- PRESERVE the overall layout and spatial arrangement
- Apply modifications seamlessly while maintaining photorealistic quality
- Ensure consistent lighting and shadows throughout
- Output should be a high-quality photorealistic image

            PROMPT

            puts "[NanoBanana] Editor AI Generate - Texture: #{texture_intensity}"
            puts "[NanoBanana] Prompt: #{prompt[0..200]}..."

            result = if reference_image
              @api_client.generate_with_references(base_image, [reference_image], prompt)
            else
              @api_client.generate(base_image, prompt)
            end

            if result && result[:image]
              @current_image = result[:image]
              @editor_dialog&.execute_script("onAIGenerateComplete('#{result[:image]}')")
              @main_dialog&.execute_script("onRenderComplete('#{result[:image]}', 'Edit')")
            else
              @editor_dialog&.execute_script("onAIGenerateError('결과를 받지 못했습니다.')")
            end

          rescue StandardError => e
            puts "[NanoBanana] Editor AI Error: #{e.message}"
            @editor_dialog&.execute_script("onAIGenerateError(#{e.message.to_json})")
          end
        end

      rescue StandardError => e
        @editor_dialog&.execute_script("onAIGenerateError('데이터 파싱 오류: #{e.message}')")
      end
    end

    # ========================================
    # 핫스팟 다이얼로그
    # ========================================
    def show_hotspot_dialog
      return unless @current_image

      if @hotspot_dialog && @hotspot_dialog.visible?
        @hotspot_dialog.bring_to_front
        return
      end

      options = {
        dialog_title: '오브젝트 배치 - NanoBanana',
        preferences_key: 'NanoBanana_HotspotDialog',
        width: 950,
        height: 700,
        min_width: 850,
        min_height: 600,
        resizable: true
      }

      @hotspot_dialog = UI::HtmlDialog.new(options)
      @hotspot_dialog.set_file(File.join(PLUGIN_ROOT, 'ui/hotspot_dialog.html'))

      register_hotspot_callbacks(@hotspot_dialog)

      @hotspot_dialog.show

      # 이미지 전송
      @hotspot_dialog.execute_script("loadBaseImage('#{@current_image}')")
    end

    def register_hotspot_callbacks(dialog)
      dialog.add_action_callback('add_hotspot') do |_ctx, data_json|
        data = JSON.parse(data_json)
        add_hotspot(data)
      end

      dialog.add_action_callback('remove_hotspot') do |_ctx, id|
        remove_hotspot(id)
      end

      dialog.add_action_callback('update_hotspot_scale') do |_ctx, id, scale|
        update_hotspot_scale(id, scale.to_f)
      end

      dialog.add_action_callback('regenerate_with_hotspots') do |_ctx|
        regenerate_with_hotspots
      end

      dialog.add_action_callback('cancel_hotspot') do |_ctx|
        dialog.close
      end
    end

    # ========================================
    # 핫스팟 관리
    # ========================================

    def add_hotspot(data)
      hotspot = HotspotManager::Hotspot.new(
        x: data['x'],
        y: data['y'],
        object_image: data['image'],
        object_name: data['name']
      )
      @current_hotspots << hotspot
      @hotspot_dialog&.execute_script("onHotspotAdded('#{hotspot.id}')")
    end

    def remove_hotspot(id)
      @current_hotspots.reject! { |h| h.id == id }
    end

    def update_hotspot_scale(id, scale)
      hotspot = @current_hotspots.find { |h| h.id == id }
      hotspot.scale = scale if hotspot
    end

    def regenerate_with_hotspots
      unless @api_client
        UI.messagebox('API Key가 설정되지 않았습니다.', MB_OK)
        return
      end

      if @current_hotspots.empty?
        UI.messagebox('배치된 오브젝트가 없습니다.', MB_OK)
        return
      end

      @hotspot_dialog&.execute_script('onRegenerateStart()')

      Thread.new do
        begin
          builder = PromptBuilder.new

          prompt = builder.build_object_placement(
            @current_hotspots,
            { width: 1920, height: 1080 }
          )

          object_images = @current_hotspots.map(&:object_image)
          result = @api_client.generate_with_references(@current_image, object_images, prompt)

          if result && result[:image]
            @current_image = result[:image]
            @current_hotspots = []
            @hotspot_dialog&.execute_script("onRegenerateComplete('#{result[:image]}')")
            @main_dialog&.execute_script("updatePreviewImage('#{result[:image]}')")
            @hotspot_dialog&.close
          else
            @hotspot_dialog&.execute_script("onRegenerateError('재생성 결과를 받지 못했습니다.')")
          end
        rescue StandardError => e
          @hotspot_dialog&.execute_script("onRegenerateError('#{e.message.gsub("'", "\\'")}')")
        end
      end
    end

    # ========================================
    # Prompt 다이얼로그 (프롬프트 편집 + 레퍼런스 이미지)
    # ========================================
    def show_prompt_dialog
      if @prompt_dialog && @prompt_dialog.visible?
        @prompt_dialog.bring_to_front
        return
      end

      options = {
        dialog_title: 'Prompt - NanoBanana',
        preferences_key: 'NanoBanana_PromptDialog',
        width: 500,
        height: 450,
        min_width: 400,
        min_height: 380,
        resizable: true
      }

      @prompt_dialog = UI::HtmlDialog.new(options)
      @prompt_dialog.set_file(File.join(PLUGIN_ROOT, 'ui/prompt_dialog.html'))

      register_prompt_callbacks(@prompt_dialog)

      @prompt_dialog.show
    end

    def register_prompt_callbacks(dialog)
      dialog.add_action_callback('prompt_ready') do |_ctx|
        if @converted_prompt && !@converted_prompt.empty?
          escaped_prompt = @converted_prompt.to_json
          dialog.execute_script("setPrompt(#{escaped_prompt})")
        end
        if @current_image
          dialog.execute_script("enableUseResult(true)")
        end
      end

      dialog.add_action_callback('prompt_apply') do |_ctx, data_json|
        begin
          data = JSON.parse(data_json)
          @converted_prompt = data['prompt'] || ''
          @reference_image = data['referenceImage']

          puts "[NanoBanana] Prompt 적용: #{@converted_prompt[0..100]}..."
          puts "[NanoBanana] Reference 이미지: #{@reference_image ? '있음' : '없음'}"

          @main_dialog&.execute_script("onPromptUpdated()")

          dialog.close
        rescue StandardError => e
          puts "[NanoBanana] Prompt 적용 에러: #{e.message}"
        end
      end

      dialog.add_action_callback('prompt_cancel') do |_ctx|
        dialog.close
      end

      dialog.add_action_callback('prompt_use_result') do |_ctx|
        if @current_image
          dialog.execute_script("setReference('#{@current_image}')")
        end
      end
    end
  end
end
