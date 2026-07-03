# frozen_string_literal: true

require 'tmpdir'

# NanoBanana Renderer - 씬(페이지) 관리
# 씬 목록, 전환, 추가, PagesObserver

module NanoBanana
  class << self
    # ========================================
    # 씬 (페이지) 관리
    # ========================================
    def get_scenes(auto_select_first = false)
      model = Sketchup.active_model
      pages = model.pages
      selected_name = pages.selected_page&.name

      scenes = pages.map do |page|
        { name: page.name, active: page.name == selected_name }
      end
      scenes << { name: 'Current View', active: true } if scenes.empty?

      scenes_json = scenes.to_json
      @main_dialog.execute_script("onScenesUpdate('#{scenes_json}')")
      if pages.count > 0
        preload_scene_previews(selected_name)
      else
        # 저장된 씬이 없어도 현재 뷰를 즉시 캡처해서 Source에 표시
        UI.start_timer(0.15, false) { load_selected_scene_source('Current View') }
      end

      # 첫 번째 씬으로 자동 전환 및 미러링 시작
      if auto_select_first && pages.count > 0
        first_page = pages[0]
        pages.selected_page = first_page
        model.active_view.invalidate
        puts "[NanoBanana] 첫 번째 씬으로 전환: #{first_page.name}"
        @main_dialog.execute_script("setMirrorActive(true)") if @main_dialog
        # UI가 미러링 활성 상태를 반영한 뒤 첫 캡처를 보낸다.
        UI.start_timer(0.2, false) { start_mirror }
      elsif auto_select_first
        @main_dialog.execute_script("setMirrorActive(true)") if @main_dialog
        UI.start_timer(0.2, false) { start_mirror }
      end
    rescue StandardError => e
      puts "[NanoBanana] 씬 목록 에러: #{e.message}"
    end

    def preload_scene_previews(priority_scene_name = nil)
      model = Sketchup.active_model
      pages_collection = model.pages
      pages = pages_collection.map { |page| page }
      return if pages.empty? || !@main_dialog

      @scene_preview_loaded ||= {}
      @scene_preview_token = Time.now.to_f
      token = @scene_preview_token

      original_page = pages_collection.selected_page
      priority_page = priority_scene_name ? pages_collection[priority_scene_name] : original_page
      priority_page ||= original_page || pages.first
      ordered_pages = ([priority_page] + pages).compact.uniq
      index = 0

      capture_next = proc do
        next unless token == @scene_preview_token

        while index < ordered_pages.length && @scene_preview_loaded[ordered_pages[index].name]
          index += 1
        end

        if index >= ordered_pages.length
          pages_collection.selected_page = original_page if original_page
          model.active_view.invalidate
          puts "[NanoBanana] 씬 프리뷰 로드 완료"
          next
        end

        page = ordered_pages[index]
        index += 1
        pages_collection.selected_page = page
        model.active_view.invalidate

        UI.start_timer(0.12, false) do
          next unless token == @scene_preview_token

          begin
            preview = capture_scene_preview_base64
            @scene_preview_loaded[page.name] = true
            @main_dialog&.execute_script("onScenePreviewLoaded(#{page.name.to_json}, #{preview.to_json})")
            if page == priority_page
              @current_image = preview
              @current_image_is_preview = true
              @main_dialog&.execute_script("onCaptureComplete(#{preview.to_json}, 0)")
              @main_dialog&.execute_script("onConvertComplete('')")
            end
            puts "[NanoBanana] 씬 프리뷰 로드: #{page.name}"
          rescue StandardError => e
            puts "[NanoBanana] 씬 프리뷰 실패 (#{page.name}): #{e.message}"
          ensure
            UI.start_timer(0.18, false) { capture_next.call }
          end
        end
      end

      UI.start_timer(0.15, false) { capture_next.call }
    rescue StandardError => e
      puts "[NanoBanana] 씬 프리뷰 로드 에러: #{e.message}"
    end

    def capture_scene_preview_base64
      temp_path = File.join(Dir.tmpdir, "nanobanana_scene_preview_#{Time.now.to_f.to_s.gsub('.', '_')}.jpg")
      view = Sketchup.active_model.active_view
      view.write_image(
        filename: temp_path,
        width: 640,
        height: 360,
        antialias: false,
        transparent: false,
        compression: 0.5
      )
      Base64.strict_encode64(File.binread(temp_path))
    ensure
      File.delete(temp_path) if temp_path && File.exist?(temp_path)
    end

    def select_scene(scene_name)
      model = Sketchup.active_model
      pages = model.pages

      if scene_name == 'Current View'
        puts "[NanoBanana] 현재 뷰 유지"
        @scene_preview_token = Time.now.to_f
        UI.start_timer(0.1, false) { load_selected_scene_source(scene_name) }
        return
      end

      page = pages[scene_name]
      if page
        pages.selected_page = page
        model.active_view.invalidate
        puts "[NanoBanana] 씬 전환: #{scene_name}"

        # 씬 전환 후 현재 Source 이미지를 갱신
        @scene_preview_token = Time.now.to_f
        UI.start_timer(0.12, false) { load_selected_scene_source(scene_name) }
      else
        puts "[NanoBanana] 씬을 찾을 수 없음: #{scene_name}"
      end
    rescue StandardError => e
      puts "[NanoBanana] 씬 전환 에러: #{e.message}"
    end

    def load_selected_scene_source(scene_name)
      preview = capture_scene_preview_base64
      @scene_preview_loaded ||= {}
      @scene_preview_loaded[scene_name] = true
      @current_image = preview
      @current_image_is_preview = true
      @main_dialog&.execute_script("onScenePreviewLoaded(#{scene_name.to_json}, #{preview.to_json})")
      @main_dialog&.execute_script("onCaptureComplete(#{preview.to_json}, 0)")
      @main_dialog&.execute_script("onConvertComplete('')")
      puts "[NanoBanana] 현재 Source 씬 로드: #{scene_name}"
      preload_scene_previews(scene_name) if scene_name != 'Current View'
    rescue StandardError => e
      puts "[NanoBanana] 현재 Source 씬 로드 실패: #{e.message}"
      @main_dialog&.execute_script("onCaptureError(#{e.message.to_json})")
    end

    # 현재 뷰를 새 씬으로 추가
    def add_scene
      model = Sketchup.active_model
      pages = model.pages

      # 씬 이름 생성
      index = pages.count + 1
      name = "Scene #{index}"
      while pages[name]
        index += 1
        name = "Scene #{index}"
      end

      # 현재 뷰를 씬으로 저장
      page = pages.add(name)
      puts "[NanoBanana] 씬 추가: #{name}"

      # 목록 갱신
      get_scenes
    rescue StandardError => e
      puts "[NanoBanana] 씬 추가 에러: #{e.message}"
    end

    # PagesObserver 등록
    def register_pages_observer
      return if @pages_observer

      @pages_observer = PagesObserver.new(self)
      Sketchup.active_model.pages.add_observer(@pages_observer)
      puts "[NanoBanana] PagesObserver 등록됨"
    end

    # PagesObserver 해제
    def unregister_pages_observer
      return unless @pages_observer

      Sketchup.active_model.pages.remove_observer(@pages_observer)
      @pages_observer = nil
    end
  end
end
