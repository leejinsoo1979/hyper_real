# frozen_string_literal: true

# NanoBanana Renderer - SketchUp AI 렌더링 플러그인
# 메인 진입점

require 'sketchup'
require 'extensions'
require 'net/http'
require 'uri'
require 'json'
require 'base64'
require 'socket'
require 'webrick'
require 'tmpdir'

module NanoBanana
  PLUGIN_NAME = 'NanoBanana Renderer'
  PLUGIN_VERSION = '1.0.4'
  PLUGIN_AUTHOR = 'NanoBanana Team'
  PLUGIN_DESCRIPTION = 'SketchUp AI 실사 렌더링 플러그인 (Google Gemini 기반)'

  # 플러그인 루트 경로
  PLUGIN_ROOT = File.dirname(__FILE__)

  # 서비스 모듈 로드 (기존)
  require_relative 'services/config_store'
  require_relative 'services/scene_exporter'
  require_relative 'services/prompt_builder'
  require_relative 'services/api_client'
  require_relative 'services/replicate_client'
  require_relative 'services/hotspot_manager'
  require_relative 'services/camera_tool'

  # 전역 상태
  @main_dialog = nil
  @settings_dialog = nil
  @editor_dialog = nil
  @hotspot_dialog = nil
  @mix_dialog = nil
  @prompt_dialog = nil
  @current_image = nil
  @current_hotspots = []
  @config_store = nil
  @api_client = nil
  @replicate_client = nil
  @current_api = 'gemini'  # 'gemini' 또는 'replicate'
  @camera_tool = nil
  @mirror_active = false
  @mirror_timer = nil
  @view_observer = nil
  @pages_observer = nil
  @converted_prompt = nil  # Convert 시 AI가 생성한 프롬프트
  @reference_image = nil   # 레퍼런스 이미지 (2차 생성용)
  @is_isometric = false    # 아이소메트릭(orthographic) 뷰 여부
  @web_sync_active = false
  @web_session_id = nil
  @web_sync_timer = nil
  @local_server = nil
  @local_server_thread = nil
  @local_port = 9876
  @current_source_image = nil

  # 웹 동기화 서버 URL
  WEB_SYNC_URL = 'https://sketchup-show.vercel.app/api/sync'

  # 히스토리 저장 경로
  HISTORY_DIR = File.join(Dir.home, '.sketchupshow')
  HISTORY_FILE = File.join(HISTORY_DIR, 'history.json')
  MAX_HISTORY_ITEMS = 500

  # 진단 로그 파일 (모든 [NanoBanana] 로그가 여기에도 기록됨)
  DEBUG_LOG_FILE = File.join(HISTORY_DIR, 'debug.log')

  class << self
    attr_accessor :current_image, :current_hotspots

    # NanoBanana 내부의 모든 puts를 루비 콘솔 + 파일에 동시 기록 (원격 진단용)
    def puts(*args)
      Kernel.puts(*args)
      begin
        Dir.mkdir(HISTORY_DIR) unless File.directory?(HISTORY_DIR)
        stamp = Time.now.strftime('%m-%d %H:%M:%S')
        File.open(DEBUG_LOG_FILE, 'a') do |f|
          args.each { |a| f.puts("[#{stamp}] #{a}") }
        end
      rescue StandardError
        # 로그 기록 실패는 무시 (본 기능에 영향 없음)
      end
    end

    # JSON 인자 파싱 헬퍼
    def parse_json_args(json_str)
      return [] if json_str.nil? || json_str.empty?
      begin
        JSON.parse(json_str)
      rescue JSON::ParserError
        # JSON이 아니면 단일 값으로 처리
        [json_str]
      end
    end

    # 플러그인 초기화
    def initialize_plugin
      @config_store = ConfigStore.new

      # Gemini API
      api_key = @config_store.load_api_key
      puts "[NanoBanana] Gemini API Key: #{api_key ? '있음' : '없음'}"
      saved_model = @config_store.load_setting('gemini_model')
      # 폐기된 구모델(gemini-2.0-*)이 저장돼 있으면 현행 모델로 자동 교체
      if saved_model && saved_model.start_with?('gemini-2.0')
        puts "[NanoBanana] 폐기된 모델 설정 감지(#{saved_model}) -> gemini-2.5-flash-image로 교체"
        saved_model = nil
      end
      @gemini_model = saved_model || 'gemini-2.5-flash-image'
      if api_key && !api_key.empty?
        @api_client = ApiClient.new(api_key, @gemini_model)
      end

      # Replicate API
      replicate_token = @config_store.load_setting('replicate_token')
      # 토큰이 없으면 nil 유지 (설정에서 입력 필요)
      if replicate_token.nil? || replicate_token.empty?
        replicate_token = nil
      end
      puts "[NanoBanana] Replicate Token: #{replicate_token ? '있음' : '없음'}"
      @replicate_model = @config_store.load_setting('replicate_model') || 'photorealistic-fx'
      if replicate_token && !replicate_token.empty?
        @replicate_client = ReplicateClient.new(replicate_token, @replicate_model)
      end

      # 기본 엔진 설정 (Gemini 우선 - 포토리얼리스틱 결과)
      @current_api = @config_store.load_setting('current_api') || 'gemini'
      puts "[NanoBanana] 현재 엔진: #{@current_api}"

      register_menu
      register_toolbar

      # 로컬 웹 서버 자동 시작
      start_local_server

      puts "[NanoBanana] 플러그인 초기화 완료 (v#{PLUGIN_VERSION}) / SketchUp #{Sketchup.version} / 경로: #{PLUGIN_ROOT}"
    end

    # 메뉴 등록
    def register_menu
      menu = UI.menu('Extensions')
      submenu = menu.add_submenu(PLUGIN_NAME)

      submenu.add_item('루비실행') { show_main_dialog }
      submenu.add_item('Vizmaker 앱 열기') { open_vizmaker_app }
      submenu.add_separator
      submenu.add_item('설정') { show_settings_dialog }
      submenu.add_separator
      submenu.add_item('도움말') { show_help }
      submenu.add_item('정보') { show_about }
    end

    # 툴바 등록
    def register_toolbar
      toolbar = UI::Toolbar.new(PLUGIN_NAME)

      # VizMaker 앱 실행 (메인 버튼 - 엔스케이프식 원클릭)
      cmd_app = UI::Command.new('VizMaker') { open_vizmaker_app }
      cmd_app.tooltip = 'VizMaker 열기'
      cmd_app.status_bar_text = '현재 뷰를 VizMaker 앱으로 보냅니다'
      cmd_app.small_icon = File.join(PLUGIN_ROOT, 'assets/icons/vizmaker_small.png')
      cmd_app.large_icon = File.join(PLUGIN_ROOT, 'assets/icons/vizmaker_large.png')
      toolbar.add_item(cmd_app)

      # 레거시 렌더 창 (기존 바나나 아이콘)
      cmd_render = UI::Command.new('렌더링(레거시)') { show_main_dialog }
      cmd_render.tooltip = 'NanoBanana 렌더링 (레거시 창)'
      cmd_render.status_bar_text = 'AI 실사 렌더링을 시작합니다'
      cmd_render.small_icon = File.join(PLUGIN_ROOT, 'assets/icons/render_small.png')
      cmd_render.large_icon = File.join(PLUGIN_ROOT, 'assets/icons/render_large.png')
      toolbar.add_item(cmd_render)

      toolbar.show
    end

    # ========================================
    # 메인 다이얼로그
    # ========================================
    def show_main_dialog
      if @main_dialog && @main_dialog.visible?
        @main_dialog.bring_to_front
        return
      end

      options = {
        dialog_title: PLUGIN_NAME,
        preferences_key: 'NanoBanana_MainDialog_v2',
        width: 1400,
        height: 800,
        min_width: 1000,
        min_height: 600,
        resizable: true
      }

      @main_dialog = UI::HtmlDialog.new(options)
      @main_dialog.set_file(File.join(PLUGIN_ROOT, 'ui/main_dialog.html'))

      # 새 다이얼로그 세션이므로 씬 프리뷰 캐시 초기화
      # (유지하면 창을 다시 열었을 때 프리뷰가 전송되지 않음)
      @scene_preview_loaded = {}

      # 콜백 등록
      register_main_callbacks(@main_dialog)

      @main_dialog.show
    end

    def register_main_callbacks(dialog)
      # 씬 캡처
      dialog.add_action_callback('capture_scene') do |_ctx, json_args|
        puts "[NanoBanana] capture_scene 콜백 수신: #{json_args.inspect}"
        args = parse_json_args(json_args)
        size = args[0] || '1024'  # ★ 기본값 1024로 변경 (속도 우선)
        capture_scene(size)
      end

      # 렌더링 시작 (새 UI: time + light + prompt + negative 파라미터)
      dialog.add_action_callback('start_render') do |_ctx, json_args|
        args = parse_json_args(json_args)
        time_preset = args[0] || 'day'
        light_switch = args[1] || 'on'
        prompt = args[2] || ''
        negative_prompt = args[3] || ''
        render_id = args[4] || ''  # 노드 에디터 병렬 렌더용 ID
        engine = args[5] || ''     # 노드에서 선택한 모델

        puts "[NanoBanana] ========== START_RENDER 콜백 =========="
        puts "[NanoBanana] args 개수: #{args.length}, 전체: #{args.map { |a| a.is_a?(String) ? a[0..30] : a.inspect }.inspect}"
        puts "[NanoBanana] time_preset: #{time_preset}"
        puts "[NanoBanana] light_switch: #{light_switch}"
        puts "[NanoBanana] prompt 길이: #{prompt ? prompt.length : 0}"
        puts "[NanoBanana] negative_prompt 길이: #{negative_prompt ? negative_prompt.length : 0}"
        puts "[NanoBanana] render_id: '#{render_id}'"
        puts "[NanoBanana] engine: '#{engine}' (args[5]=#{args[5].inspect})"

        # UI에서 직접 입력한 프롬프트가 있으면 사용
        if prompt && !prompt.empty?
          @converted_prompt = prompt
          puts "[NanoBanana] 프롬프트 저장됨: #{prompt[0..100]}..."
        else
          puts "[NanoBanana] 프롬프트 비어있음!"
        end
        @negative_prompt = negative_prompt if negative_prompt && !negative_prompt.empty?

        if render_id && !render_id.empty?
          # 노드 에디터 병렬 렌더 — 엔진도 전달
          start_render_parallel(time_preset, light_switch, render_id, prompt, negative_prompt, engine)
        else
          start_render_with_preset(time_preset, light_switch)
        end
      end

      # Auto 프롬프트 생성 요청 (스타일 + 라이팅 파라미터)
      dialog.add_action_callback('generate_auto_prompt') do |_ctx, json_args|
        args = parse_json_args(json_args)
        style = args[0] || ''
        time_preset = args[1] || 'day'
        light_switch = args[2] || 'on'
        generate_auto_prompt(style, time_preset, light_switch)
      end

      # Auto 프롬프트 취소
      dialog.add_action_callback('cancel_auto_prompt') do |_ctx|
        cancel_auto_prompt
      end

      # 이미지 저장
      dialog.add_action_callback('save_image') do |_ctx, json_args|
        args = parse_json_args(json_args)
        filename = args[0] || ''
        save_image(filename)
      end

      # 히스토리 저장
      dialog.add_action_callback('save_history') do |_ctx, history_json|
        save_history_to_file(history_json)
      end

      # 히스토리 로드
      dialog.add_action_callback('load_history') do |_ctx|
        load_history_from_file
      end

      # API Key 저장 (메인 다이얼로그 내 설정용)
      dialog.add_action_callback('save_api_key') do |_ctx, key|
        save_api_key_from_main(key)
      end

      # API Key 로드 (메인 다이얼로그 내 설정용)
      dialog.add_action_callback('load_api_key') do |_ctx|
        load_api_key_to_main
      end

      # 연결 테스트 (메인 다이얼로그 내 설정용)
      dialog.add_action_callback('test_connection') do |_ctx|
        test_connection_from_main
      end

      # 이미지 보정 다이얼로그 열기
      dialog.add_action_callback('open_editor') do |_ctx|
        show_editor_dialog
      end

      # API 연결 상태 확인
      dialog.add_action_callback('check_api_status') do |_ctx|
        check_api_status
      end

      # 모델 저장 (메인 다이얼로그용)
      dialog.add_action_callback('save_model') do |_ctx, model|
        save_model(model)
      end

      # 모델 로드 (메인 다이얼로그용)
      dialog.add_action_callback('load_model') do |_ctx|
        load_model_to_main_dialog
      end

      # ★ Replicate API 토큰 저장
      dialog.add_action_callback('save_replicate_token') do |_ctx, token|
        save_replicate_token(token)
      end

      # ★ Replicate API 토큰 로드
      dialog.add_action_callback('load_replicate_token') do |_ctx|
        load_replicate_token
      end

      # ★ 엔진 선택 (gemini / replicate)
      dialog.add_action_callback('set_engine') do |_ctx, engine|
        set_current_engine(engine)
      end

      # ★ 현재 엔진 로드
      dialog.add_action_callback('get_engine') do |_ctx|
        @main_dialog&.execute_script("onEngineLoaded('#{@current_api}')")
      end

      # 카메라 이동
      dialog.add_action_callback('cam_move') do |_ctx, direction_json|
        puts "[NanoBanana] cam_move 호출됨: #{direction_json.inspect}"
        args = parse_json_args(direction_json)
        dir = args.is_a?(Array) ? args[0] : args
        puts "[NanoBanana] 카메라 이동: #{dir}"
        camera_move(dir.to_s)
      end

      # 카메라 회전
      dialog.add_action_callback('cam_rotate') do |_ctx, direction_json|
        puts "[NanoBanana] cam_rotate 호출됨: #{direction_json.inspect}"
        args = parse_json_args(direction_json)
        dir = args.is_a?(Array) ? args[0] : args
        puts "[NanoBanana] 카메라 회전: #{dir}"
        camera_rotate(dir.to_s)
      end

      # 카메라 높이 프리셋
      dialog.add_action_callback('cam_height') do |_ctx, preset_json|
        args = parse_json_args(preset_json)
        preset = args.is_a?(Array) ? args[0] : args
        camera_set_height(preset.to_s)
      end

      # 카메라 FOV 프리셋
      dialog.add_action_callback('cam_fov') do |_ctx, preset_json|
        args = parse_json_args(preset_json)
        preset = args.is_a?(Array) ? args[0] : args
        camera_set_fov(preset.to_s)
      end

      # 미러링 시작
      dialog.add_action_callback('start_mirror') do |_ctx|
        start_mirror
      end

      # 미러링 중지
      dialog.add_action_callback('stop_mirror') do |_ctx|
        stop_mirror
      end

      # 씬 목록 가져오기 (첫 로드 시 첫 번째 씬으로 자동 전환)
      dialog.add_action_callback('get_scenes') do |_ctx|
        get_scenes(false)
      end

      # 씬 선택/전환
      dialog.add_action_callback('select_scene') do |_ctx, scene_name|
        args = parse_json_args(scene_name)
        selected_scene = args.is_a?(Array) ? args[0] : args
        puts "[NanoBanana] select_scene 콜백 수신: #{selected_scene.inspect}"
        select_scene(selected_scene.to_s)
      end

      # 씬 추가
      dialog.add_action_callback('add_scene') do |_ctx|
        add_scene
      end

      # 2점 투시 적용
      dialog.add_action_callback('apply_2point') do |_ctx|
        apply_two_point_perspective
      end

      # Mix 다이얼로그 열기
      dialog.add_action_callback('open_mix') do |_ctx|
        show_mix_dialog
      end

      # Prompt 다이얼로그 열기
      dialog.add_action_callback('open_prompt') do |_ctx|
        show_prompt_dialog
      end

      # 2차 생성 (이전 결과를 소스로 사용)
      # panel_id: 숫자(렌더모드) 또는 문자열(노드에디터 inpaint_X)
      dialog.add_action_callback('regenerate') do |_ctx, source_base64, prompt, panel_id|
        regenerate_image(source_base64, prompt, panel_id.to_s)
      end

      # 웹 동기화 시작
      dialog.add_action_callback('start_web_sync') do |_ctx|
        session_id = start_web_sync
        dialog.execute_script("onWebSyncStarted('#{session_id}')")
      end

      # 웹 동기화 중지
      dialog.add_action_callback('stop_web_sync') do |_ctx|
        stop_web_sync
        dialog.execute_script("onWebSyncStopped()")
      end

      # PagesObserver 등록 (씬 변경 감지)
      register_pages_observer
    end

    # ========================================
    # 도움말 및 정보
    # ========================================

    # Vizmaker 앱 열기: 현재 뷰 즉시 캡처 + 설치된 데스크톱 앱 실행
    # (엔스케이프와 동일한 UX: CAD에서 클릭 -> 앱이 뜨면서 뷰 전송)
    def open_vizmaker_app
      start_local_server unless @local_server
      capture_current_view

      if Sketchup.platform == :platform_osx
        # 설치된 VizMaker.app 실행 (이미 떠 있으면 포커스만 - 단일 인스턴스)
        launched = system('open', '-a', 'VizMaker')
        if launched
          puts '[NanoBanana] VizMaker 앱 실행'
          return
        end
      end

      # 앱이 설치되어 있지 않으면 웹 버전으로 폴백
      app_url = @config_store&.load_setting('vizmaker_app_url')
      app_url = 'https://hyper-real-3vvh.vercel.app' if app_url.nil? || app_url.empty?
      UI.openURL(app_url)
      puts "[NanoBanana] VizMaker 웹으로 열기: #{app_url}"
    rescue StandardError => e
      puts "[NanoBanana] Vizmaker 앱 열기 실패: #{e.message}"
    end

    def show_help
      UI.openURL('https://github.com/nanobanana/sketchup-plugin/wiki')
    end

    def show_about
      message = <<~MSG
        #{PLUGIN_NAME}
        버전: #{PLUGIN_VERSION}

        SketchUp AI 실사 렌더링 플러그인
        Google Gemini API 기반

        #{PLUGIN_AUTHOR}
      MSG
      UI.messagebox(message, MB_OK)
    end
  end

  # 서비스 모듈 로드 (추출된 서비스)
  require_relative 'services/camera_control'
  require_relative 'services/scene_manager'
  require_relative 'services/prompt_engine'
  require_relative 'services/render_engine'
  require_relative 'services/settings_manager'
  require_relative 'services/image_manager'
  require_relative 'services/secondary_dialogs'
  require_relative 'services/mix_engine'
  require_relative 'services/web_sync'

  # 미러링용 ViewObserver (스로틀링 적용 - 부드러운 반응)
  class MirrorViewObserver < Sketchup::ViewObserver
    def initialize(plugin)
      @plugin = plugin
      @pending = false
      @last_capture = 0
    end

    def onViewChanged(view)
      return unless @plugin.mirror_active?
      return if @pending

      # 100ms 스로틀링
      now = Time.now.to_f
      return if (now - @last_capture) < 0.1

      @pending = true
      @last_capture = now

      # 다음 프레임에서 캡처 (UI 블로킹 방지)
      UI.start_timer(0.05, false) do
        @plugin.mirror_capture
        @pending = false
      end
    end
  end

  # 씬(페이지) 변경 감지용 Observer
  class PagesObserver < Sketchup::PagesObserver
    def initialize(plugin)
      @plugin = plugin
    end

    def onContentsModified(pages)
      @plugin.get_scenes
    end

    def onElementAdded(pages, page)
      @plugin.get_scenes
    end

    def onElementRemoved(pages, page)
      @plugin.get_scenes
    end
  end
end

# 플러그인 로드 시 초기화 (항상 실행 - load 명령으로 리로드 가능)
NanoBanana.initialize_plugin
