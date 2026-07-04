# frozen_string_literal: true

# NanoBanana Renderer - SketchUp Extension Loader
# 이 파일을 SketchUp의 Plugins 폴더에 복사하세요.

require 'sketchup'
require 'extensions'

module NanoBanana
  unless file_loaded?(__FILE__)
    # Extension 정보 설정
    extension = SketchupExtension.new('NanoBanana Renderer', 'nano_banana_renderer/main')
    extension.description = 'SketchUp AI 실사 렌더링 플러그인 (Google Gemini API 기반). 인테리어 씬을 실사 이미지로 변환하고, 조명/시간대 변경, 오브젝트 배치 등의 기능을 제공합니다.'
    extension.version = '1.0.4'
    extension.creator = 'NanoBanana Team'
    extension.copyright = '2024, NanoBanana Team'

    # Extension 등록
    Sketchup.register_extension(extension, true)

    file_loaded(__FILE__)
  end
end
