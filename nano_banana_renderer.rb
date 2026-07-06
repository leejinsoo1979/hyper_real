# frozen_string_literal: true

# Lumanova - SketchUp Extension Loader
# 이 파일을 SketchUp의 Plugins 폴더에 복사하세요.

require 'sketchup'
require 'extensions'

module NanoBanana
  unless file_loaded?(__FILE__)
    # Extension 정보 설정
    extension = SketchupExtension.new('Lumanova', 'nano_banana_renderer/main')
    extension.description = 'SketchUp과 연동되는 AI 실사 렌더링 플러그인. 현재 뷰와 저장된 씬을 Lumanova로 보내 고품질 이미지와 영상을 생성합니다.'
    extension.version = '1.0.7'
    extension.creator = 'Lumanova'
    extension.copyright = '2026, Lumanova'

    # Extension 등록
    Sketchup.register_extension(extension, true)

    file_loaded(__FILE__)
  end
end
