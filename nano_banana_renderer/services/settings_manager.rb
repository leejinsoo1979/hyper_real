# frozen_string_literal: true

# NanoBanana Renderer - 설정 관리
# API Key, 모델, 엔진, 연결 테스트

module NanoBanana
  class << self
    # ========================================
    # API Key 관리
    # ========================================

    # API Key 저장
    def save_api_key(key)
      @config_store.save_api_key(key)
      @api_client = ApiClient.new(key, @gemini_model)
      @settings_dialog&.execute_script("onApiKeySaved()")
    end

    # API Key 로드
    def load_api_key_to_dialog
      key = @config_store.load_api_key
      masked_key = key ? ('•' * [key.length - 4, 0].max) + key[-4..-1].to_s : ''
      @settings_dialog&.execute_script("onApiKeyLoaded('#{masked_key}')")
    end

    # API Key 저장 (메인 다이얼로그용)
    def save_api_key_from_main(key)
      @config_store.save_api_key(key)
      @api_client = ApiClient.new(key, @gemini_model)
      check_api_status  # 상태 업데이트
    end

    # API Key 로드 (메인 다이얼로그용)
    def load_api_key_to_main
      key = @config_store.load_api_key
      if key && key.length > 4
        masked_key = ('•' * (key.length - 4)) + key[-4..-1]
      elsif key && key.length > 0
        masked_key = '•' * key.length
      else
        masked_key = ''
      end
      puts "[NanoBanana] API Key 로드: #{masked_key.length > 0 ? '저장됨' : '없음'}"
      @main_dialog&.execute_script("onApiKeyLoaded('#{masked_key}')")
    end

    # ========================================
    # Replicate 토큰 관리
    # ========================================

    # Replicate 토큰 저장
    def save_replicate_token(token)
      @config_store.save_setting('replicate_token', token)
      @replicate_client = ReplicateClient.new(token, @replicate_model || 'photorealistic-fx')
      puts "[NanoBanana] Replicate 토큰 저장됨"
      check_api_status
    end

    # Replicate 토큰 로드
    def load_replicate_token
      token = @config_store.load_setting('replicate_token')
      if token && token.length > 4
        masked = ('•' * (token.length - 4)) + token[-4..-1]
      else
        masked = ''
      end
      @main_dialog&.execute_script("onReplicateTokenLoaded('#{masked}')")
    end

    # ========================================
    # 엔진 설정
    # ========================================

    # 엔진 설정
    def set_current_engine(engine)
      @current_api = engine
      @config_store.save_setting('current_api', engine)
      puts "[NanoBanana] 엔진 변경: #{engine}"
      check_api_status
    end

    # ========================================
    # 연결 테스트
    # ========================================

    # 연결 테스트 (메인 다이얼로그용)
    def test_connection_from_main
      Thread.new do
        begin
          if @api_client&.test_connection
            @main_dialog&.execute_script("onConnectionTestResult(true, 'API 연결 성공')")
          else
            @main_dialog&.execute_script("onConnectionTestResult(false, 'API 연결 실패')")
          end
        rescue StandardError => e
          @main_dialog&.execute_script("onConnectionTestResult(false, #{e.message.to_json})")
        end
      end
    end

    # 모델 저장
    def save_model(model)
      # 모델 이름으로 소속 엔진을 판별해 엔진까지 자동 전환 (모델-엔진 불일치 방지)
      if model.to_s.start_with?('gemini', 'imagen')
        @config_store.save_setting('gemini_model', model)
        @gemini_model = model
        @api_client.model = model if @api_client
        puts "[NanoBanana] Gemini 모델 설정: #{model}"
        set_current_engine('gemini') if @current_api != 'gemini'
      else
        @config_store.save_setting('replicate_model', model)
        @replicate_model = model
        @replicate_client.model = model if @replicate_client && @replicate_client.respond_to?(:model=)
        puts "[NanoBanana] Replicate 모델 설정: #{model}"
        set_current_engine('replicate') if @current_api != 'replicate'
      end
    end

    # 모델 로드
    def load_model_to_dialog
      model = @config_store.load_setting('gemini_model') || 'gemini-2.5-flash'
      @gemini_model = model
      @settings_dialog&.execute_script("onModelLoaded('#{model}')")
    end

    # 모델 로드 (메인 다이얼로그용)
    def load_model_to_main_dialog
      model = @config_store.load_setting('gemini_model') || 'gemini-2.5-flash'
      @gemini_model = model
      @main_dialog&.execute_script("onModelLoaded('#{model}')")
    end

    # API 연결 테스트
    def test_api_connection
      unless @api_client
        @settings_dialog&.execute_script("onConnectionTestResult(false, 'API Key가 설정되지 않았습니다.')")
        return
      end

      Thread.new do
        begin
          result = @api_client.test_connection
          if result
            @settings_dialog&.execute_script("onConnectionTestResult(true, '연결 성공')")
          else
            @settings_dialog&.execute_script("onConnectionTestResult(false, '연결 실패')")
          end
        rescue StandardError => e
          @settings_dialog&.execute_script("onConnectionTestResult(false, #{e.message.to_json})")
        end
      end
    end

    # API 상태 확인
    def check_api_status
      has_key = @api_client ? true : false
      @main_dialog&.execute_script("onApiStatusUpdate(#{has_key})")
    end
  end
end
