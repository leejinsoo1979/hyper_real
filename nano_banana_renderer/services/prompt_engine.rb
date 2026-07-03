# frozen_string_literal: true

# NanoBanana Renderer - 프롬프트 엔진
# AI 프롬프트 생성, 재질 분석, 렌더링 프롬프트 빌드

module NanoBanana
  class << self
    # AI 프롬프트 생성용 시스템 인스트럭션 템플릿
    def get_ai_instruction_template(materials_info, user_style = '', time_preset = 'day', light_switch = 'on')
      style_hint = user_style.to_s.empty? ? "modern luxury interior" : user_style

      # 라이팅 설명 생성 (사용자 설정 기반)
      lighting_desc = build_lighting_description(time_preset, light_switch)

      # ★ 아이소메트릭 뷰 전용 프롬프트
      if @is_isometric
        puts "[NanoBanana] 아이소메트릭 전용 프롬프트 템플릿 사용"
        return get_isometric_instruction_template(materials_info, style_hint, lighting_desc)
      end

      <<~TEXT
    [CRITICAL TASK]
    You must generate a detailed photorealistic rendering prompt for this interior space.
    This is an IMAGE-TO-IMAGE transformation task. The goal is to convert a 3D SketchUp model into a professional interior photograph.

    [ABSOLUTE CONSTRAINTS - MUST BE INCLUDED IN PROMPT]
    1. PRESERVE EXACT COMPOSITION: Every wall, floor, ceiling, window, door must stay in the EXACT same position
    2. NO ADDITIONS: Do NOT add any objects, furniture, mirrors, handles, plants, decorations, or accessories
    3. NO REMOVALS: Do NOT remove anything that exists in the source image
    4. SAME ROOM ONLY: The output must look like the SAME room photographed professionally

    [SOURCE MATERIALS FROM SKETCHUP MODEL]
    #{materials_info}

    [REQUIRED PROMPT STRUCTURE]
    Generate a prompt following this EXACT format:

    ---START OF PROMPT---

    [INPUT IMAGE PRESERVATION - CRITICAL]
    Preserve the EXACT composition, camera angle, and object placement from the input image.
    Do NOT add any new objects, furniture, mirrors, door handles, light switches, plants, rugs, or decorative items.
    Do NOT remove any existing objects from the scene.
    This is a strict image-to-image transformation, not a creative redesign.

    [PHOTOREALISTIC TRANSFORMATION]
    Transform this 3D SketchUp interior render into a professional architectural photograph.
    Style: #{style_hint}
    Camera: Canon EOS R5 with 24mm f/2.8 lens, professional architectural photography
    Quality: 8K resolution, sharp focus, professional color grading

    [MATERIAL RENDERING - BASED ON SOURCE]
    Convert all surfaces to photorealistic materials with natural imperfections:
    - Wood surfaces: visible grain texture, subtle scratches, natural wood imperfections
    - Wall surfaces: realistic paint texture, subtle shadows, minor surface variations
    - Floor surfaces: realistic material texture with wear patterns and reflections
    - Glass surfaces: realistic reflections, subtle smudges, proper transparency
    - Metal surfaces: realistic reflections, subtle fingerprints, appropriate finish

    [LIGHTING SETUP]
    #{lighting_desc}
    - Soft natural shadows with realistic falloff
    - Global illumination and realistic light bounce
    - Subtle ambient occlusion in corners and edges

    [PHOTO REALISM DETAILS]
    - Natural lens characteristics: subtle vignette, minimal chromatic aberration
    - Realistic depth of field with natural bokeh
    - Film-like quality with subtle grain (ISO 200-400)
    - Professional white balance and color temperature

    [NEGATIVE PROMPT - MUST AVOID]
    black outlines, visible edges, sketch lines, wireframe appearance, line art style, hard black lines, 3D render look, CGI appearance, computer graphics, architectural visualization, clean perfect surfaces, uniform flat lighting, artificial plastic look, cartoon style, anime style, painting style, illustration, hand-drawn, digital art, concept art, unrealistic colors, oversaturated, HDR artifacts, bloom effects, lens flare, motion blur

    ---END OF PROMPT---

    [YOUR OUTPUT]
    Generate ONLY the prompt content between ---START OF PROMPT--- and ---END OF PROMPT--- markers.
    Do NOT include any explanations, comments, or additional text.
    The prompt must be detailed and specific to achieve photorealistic results.
      TEXT
    end

    # ★ 아이소메트릭 뷰 전용 AI 인스트럭션 템플릿
    def get_isometric_instruction_template(materials_info, style_hint, lighting_desc)
      <<~TEXT
    [CRITICAL TASK - ISOMETRIC VIEW]
    You must generate a detailed photorealistic rendering prompt for this ISOMETRIC interior scene.
    This is an IMAGE-TO-IMAGE transformation task. The source image is an isometric (orthographic, top-down angled) 3D SketchUp model viewed from above at approximately 30-45 degrees.
    The goal is to convert it into a photorealistic isometric architectural visualization with a PURE WHITE background.

    [ABSOLUTE CONSTRAINTS - ISOMETRIC SPECIFIC]
    1. PRESERVE EXACT ISOMETRIC CAMERA ANGLE: Keep the same orthographic top-down viewing angle. Do NOT change to perspective view.
    2. PRESERVE EXACT LAYOUT: Every wall, floor, furniture, and object must remain in the EXACT same position and scale
    3. PRESERVE EXACT FLOOR AND WALL MATERIALS: Do NOT change any floor material (wood, tile, concrete, etc.) or wall color/texture. Keep them IDENTICAL to the source.
    4. NO ADDITIONS: Do NOT add any objects, furniture, plants, decorations, rugs, accessories, or items not present in the source image
    5. NO REMOVALS: Do NOT remove anything that exists in the source image
    6. PURE WHITE BACKGROUND: The area outside the room/building footprint must be PURE WHITE (#FFFFFF). No shadows, no gradients, no ground plane, no environment outside the building.
    7. NO BACKGROUND ENVIRONMENT: Do NOT add sky, trees, landscape, ground texture, or any exterior elements outside the room boundary

    [SOURCE MATERIALS FROM SKETCHUP MODEL]
    #{materials_info}

    [REQUIRED PROMPT STRUCTURE]
    Generate a prompt following this EXACT format:

    ---START OF PROMPT---

    [STRICT IMAGE PRESERVATION - ISOMETRIC]
    This is an isometric (orthographic) top-down angled view of an interior space.
    Preserve the EXACT isometric camera angle, orthographic projection, and spatial layout.
    Preserve the EXACT floor material, wall material, and all surface textures from the source image. Do NOT replace or change any material.
    Do NOT add ANY new objects, furniture, plants, rugs, decorative items, door handles, light switches, or accessories.
    Do NOT remove any existing objects from the scene.
    The background outside the room footprint must be PURE WHITE.

    [ISOMETRIC PHOTOREALISTIC TRANSFORMATION]
    Transform this 3D SketchUp isometric model into a photorealistic isometric architectural visualization.
    Style: #{style_hint}
    Projection: Orthographic isometric, same angle as source
    Quality: 8K resolution, sharp focus, clean rendering
    Background: Pure white (#FFFFFF) outside the room boundary, no shadows cast outside

    [MATERIAL RENDERING - PRESERVE SOURCE MATERIALS]
    Convert surfaces to photorealistic versions of their EXISTING materials (do NOT change material types):
    - Floor: Enhance the EXISTING floor material to photorealistic quality. Keep the same material type (wood stays wood, tile stays tile, etc.)
    - Walls: Enhance the EXISTING wall color/texture to photorealistic quality. Keep the same color and material.
    - Furniture: Add realistic material textures to existing furniture while preserving exact shape and position
    - Glass surfaces: realistic reflections and proper transparency
    - Metal surfaces: realistic reflections with appropriate finish

    [LIGHTING FOR ISOMETRIC]
    #{lighting_desc}
    - Soft overhead studio-like lighting for clean isometric presentation
    - Subtle ambient occlusion at wall-floor junctions and furniture bases
    - Soft contact shadows under furniture (contained within the room footprint)
    - No harsh shadows extending outside the room boundary

    [ISOMETRIC QUALITY DETAILS]
    - Clean, sharp edges on all architectural elements
    - Consistent isometric scale across all objects
    - No perspective distortion, maintain orthographic projection
    - Professional architectural visualization quality
    - Miniature diorama-like photorealistic feel

    [NEGATIVE PROMPT - MUST AVOID]
    perspective view, vanishing points, perspective distortion, background environment, sky, trees, landscape, ground outside room, colored background, gradient background, shadows outside room boundary, added furniture, new objects, extra plants, extra decorations, changed floor material, changed wall color, wireframe, sketch lines, black outlines, cartoon, anime, CGI look, 3D render artifacts, low quality, blurry

    ---END OF PROMPT---

    [YOUR OUTPUT]
    Generate ONLY the prompt content between ---START OF PROMPT--- and ---END OF PROMPT--- markers.
    Do NOT include any explanations, comments, or additional text.
    The prompt must preserve the isometric angle and produce photorealistic results with a pure white background.
      TEXT
    end

    # 라이팅 설명 생성 헬퍼
    def build_lighting_description(time_preset, light_switch)
      time_desc = case time_preset.to_s.downcase
        when 'evening'
          "warm evening sunset tones through windows"
        when 'night'
          "dark exterior through windows, nighttime atmosphere"
        else # day
          "bright natural daylight through windows"
      end

      light_desc = if light_switch.to_s.downcase == 'off'
        "artificial lights OFF, ambient light only"
      else
        "interior lights ON, warm artificial illumination"
      end

      "#{time_desc}, #{light_desc}, soft shadows, global illumination, realistic light bounce"
    end

    # Auto 프롬프트 생성 (분석 데이터 + 스타일 기반 + SketchUp 재질 정보 + 라이팅)
    def generate_auto_prompt(user_style = '', time_preset = 'day', light_switch = 'on')
      puts "[NanoBanana] ========== AUTO 프롬프트 생성 시작 =========="
      puts "[NanoBanana] user_style: #{user_style.inspect}"
      puts "[NanoBanana] time_preset: #{time_preset}, light_switch: #{light_switch}"

      unless @api_client
        puts "[NanoBanana] API 클라이언트 없음"
        return
      end

      unless @current_image
        puts "[NanoBanana] 이미지 없음 - Convert 먼저 실행하세요"
        return
      end

      puts "[NanoBanana] 이미지 있음: #{@current_image.length} bytes"

      # 소스가 저해상 프리뷰면 고품질로 재캡처 (분석 정확도 확보)
      if @current_image_is_preview
        puts "[NanoBanana] 소스가 저해상 프리뷰 - 고품질 재캡처 실행"
        capture_scene('1024')
      end

      # 취소 지원: 요청마다 토큰 발급, 취소 시 토큰 무효화로 늦게 온 결과 폐기
      @auto_prompt_token = (@auto_prompt_token || 0) + 1
      token = @auto_prompt_token

      @main_dialog&.execute_script("onAutoPromptStart()")

      # Thread 사용 금지 (SketchUp Ruby에서 조용히 멈춤) - 타이머로 UI 갱신 후 동기 실행
      UI.start_timer(0.1, false) do
        begin
          next if token != @auto_prompt_token # 취소됨

          # ★★★ SketchUp 모델에서 재질 정보 추출 ★★★
          materials_info = extract_materials_info
          puts "[NanoBanana] 추출된 재질 정보:"
          puts materials_info[0..500] + "..."

          # 재질 중심 시스템 인스트럭션 생성 (라이팅 설정 포함)
          prompt_request = get_ai_instruction_template(materials_info, user_style, time_preset, light_switch)

          result = @api_client.analyze_scene(@current_image, prompt_request)

          next if token != @auto_prompt_token # 취소됨 - 결과 폐기

          if result && result[:text]
            raw_prompt = result[:text]

            # [STRICT 또는 **[STRICT 로 시작하는 부분부터 사용
            if raw_prompt =~ /(\*?\*?\[STRICT|\[INPUT|\[OUTPUT|\[ABSOLUTE)/
              clean_prompt = raw_prompt[$~.begin(0)..-1]
            else
              clean_prompt = raw_prompt
            end

            # 메인 프롬프트와 네거티브 분리
            main_prompt = clean_prompt
            negative_prompt = ""

            if clean_prompt =~ /\[NEGATIVE[^\]]*\]\s*(.+)/mi
              # AI가 출력하는 섹션 제목은 [NEGATIVE PROMPT - MUST AVOID] 형태 - 제목 변형 허용
              negative_prompt = $1.sub(/---.*\z/m, '').strip
              main_prompt = clean_prompt.sub(/\[NEGATIVE[^\]]*\].*\z/m, '').strip
            elsif clean_prompt =~ /Negative[:\s]*(.+)/mi
              negative_prompt = $1.strip.sub(/\n.*$/m, '')  # 첫 줄만
              main_prompt = clean_prompt.sub(/Negative[:\s]*.+/mi, '').strip
            elsif clean_prompt =~ /---\s*\n(.+)/m
              negative_prompt = $1.strip
              main_prompt = clean_prompt.sub(/---\s*\n.+/m, '').strip
            end

            # 네거티브가 없으면 강화된 기본값 설정
            if negative_prompt.empty?
              negative_prompt = "adding new objects, extra furniture, plants, vases, decor, clutter, sketchup, wireframe, 3d model, cartoon, lines, edges, cgi, render artifacts, simplified textures, low quality, blurry, architectural changes, remodeling"
            end

            # 필수 네거티브 키워드 강제 추가
            required_negatives = "adding new objects, extra furniture, plants, vases, decor, sketchup, wireframe, "
            unless negative_prompt.downcase.include?('adding new objects')
              negative_prompt = required_negatives + negative_prompt
            end

            puts "[NanoBanana] Auto 프롬프트 생성 완료"
            puts "[NanoBanana] 네거티브: #{negative_prompt[0..50]}..."

            escaped_main = main_prompt.to_json
            escaped_negative = negative_prompt.to_json
            @main_dialog&.execute_script("onAutoPromptComplete(#{escaped_main}, #{escaped_negative})")
          else
            puts "[NanoBanana] Auto 프롬프트 생성 실패"
            @main_dialog&.execute_script("onAutoPromptError('프롬프트 생성 실패')")
          end

        rescue StandardError => e
          next if token != @auto_prompt_token # 취소됨
          puts "[NanoBanana] Auto 프롬프트 에러: #{e.message}"
          @main_dialog&.execute_script("onAutoPromptError(#{e.message.to_json})")
        end
      end
    end

    # Auto 프롬프트 취소 (진행 중인 요청의 결과를 폐기)
    def cancel_auto_prompt
      @auto_prompt_token = (@auto_prompt_token || 0) + 1
      puts "[NanoBanana] Auto 프롬프트 취소됨"
    end

    # ========================================
    # 재질 분석
    # ========================================

    # 모델에서 재질 정보 추출 (의미 있는 질감만, 영문으로)
    def extract_materials_info
      model = Sketchup.active_model
      materials = model.materials

      return "High-end architectural finishes" if materials.count == 0

      # Face 면적 기준으로 재질 수집
      material_area = {}  # { material_name => total_area }

      collect_material_areas(model.active_entities, material_area)

      # 면적 기준 상위 재질 선택
      sorted_materials = material_area.sort_by { |_, area| -area }

      # 의미 있는 재질만 필터링 (쓰레기 이름 제외)
      meaningful_textures = []

      sorted_materials.each do |mat_name, _area|
        texture_desc = extract_texture_description(mat_name, materials[mat_name])
        next if texture_desc.nil?  # 쓰레기 이름은 스킵

        meaningful_textures << texture_desc
        break if meaningful_textures.length >= 6  # 최대 6개
      end

      # 의미 있는 재질이 없으면 기본값
      if meaningful_textures.empty?
        return "High-end architectural finishes with natural materials"
      end

      meaningful_textures.join(", ")
    rescue StandardError => e
      puts "[NanoBanana] 재질 추출 에러: #{e.message}"
      "Premium interior finishes"
    end

    # 재질 이름에서 질감 설명 추출 (쓰레기면 nil 반환)
    def extract_texture_description(name, material)
      name_lower = name.downcase

      # === 쓰레기 이름 패턴 (nil 반환) ===
      garbage_patterns = [
        /^재질\d*$/,           # 재질1, 재질30
        /^\[?color[_\s]?\d*\]?$/i,  # [Color_001], Color 1
        /^material\d*$/i,      # Material1
        /^\d+$/,               # 순수 숫자
        /^[a-f0-9]{6}$/i,      # 헥스 컬러코드
        /^default/i,           # Default
        /^untitled/i,          # Untitled
      ]

      garbage_patterns.each do |pattern|
        return nil if name_lower =~ pattern
      end

      # === 의미 있는 질감 키워드 매핑 ===
      texture_map = {
        # 우드
        /walnut/i => "Dark walnut wood with natural grain",
        /oak/i => "Light oak wood, subtle grain",
        /maple/i => "Maple wood, smooth finish",
        /cherry/i => "Cherry wood, warm tone",
        /teak/i => "Teak wood, rich grain",
        /birch/i => "Birch wood, light tone",
        /pine/i => "Pine wood, natural knots",
        /wood/i => "Natural wood finish",
        /timber/i => "Timber finish",
        /veneer/i => "Wood veneer, satin finish",
        /마루|인쇄마루|온돌마루/i => "Wood flooring, natural finish",

        # 스톤/타일
        /marble|대리석/i => "Polished marble with subtle veins",
        /granite/i => "Granite surface, polished",
        /slate/i => "Slate stone, matte",
        /stone/i => "Natural stone finish",
        /tile|타일/i => "Ceramic tile, clean grout",
        /porcelain/i => "Porcelain tile, glossy",
        /terrazzo/i => "Terrazzo, polished aggregate",

        # 금속
        /chrome/i => "Chrome, mirror finish",
        /brass/i => "Brushed brass",
        /copper/i => "Copper, natural patina",
        /steel|stainless/i => "Brushed stainless steel",
        /iron/i => "Black iron finish",
        /aluminum/i => "Anodized aluminum",
        /metal/i => "Metal finish",
        /corrug/i => "Corrugated metal",

        # 패브릭
        /leather/i => "Premium leather texture",
        /velvet/i => "Soft velvet fabric",
        /linen/i => "Natural linen texture",
        /fabric|cloth/i => "Woven fabric",
        /cotton/i => "Cotton fabric",

        # 기타
        /concrete|콘크리트/i => "Raw concrete, industrial",
        /glass|유리/i => "Clear glass, subtle reflections",
        /brick|벽돌/i => "Exposed brick",
        /plaster/i => "Smooth plaster wall",
        /paint/i => "Matte painted surface",
        /plastic|pvc/i => "Matte plastic",
        /acrylic/i => "Clear acrylic",
        /lacquer/i => "High-gloss lacquer",
        /matte/i => "Matte finish",
        /gloss/i => "Glossy finish",
      }

      texture_map.each do |pattern, description|
        return description if name =~ pattern
      end

      # 텍스처 파일이 있으면 그걸로 추정
      if material&.texture
        filename = File.basename(material.texture.filename).downcase rescue ""
        texture_map.each do |pattern, description|
          return description if filename =~ pattern
        end
      end

      # 색상 기반 추정 (마지막 수단)
      if material&.color
        c = material.color
        brightness = (c.red + c.green + c.blue) / 3

        if brightness > 200
          return "Off-white surface"
        elsif brightness < 50
          return "Dark matte surface"
        elsif c.red > c.blue && c.red > c.green
          return "Warm-toned surface"
        elsif c.blue > c.red
          return "Cool-toned surface"
        end
      end

      # 이름에서 영문 키워드 추출 시도
      english_words = name.scan(/[a-zA-Z]{4,}/).map(&:downcase).uniq
      return nil if english_words.empty?

      # 의미 있는 영문 단어가 있으면 사용
      meaningful = english_words.reject { |w| %w[material color default texture].include?(w) }
      return nil if meaningful.empty?

      "#{meaningful.first.capitalize} finish"
    end

    # Face 면적 수집
    def collect_material_areas(entities, material_area, depth = 0)
      return if depth > 5

      entities.each do |entity|
        case entity
        when Sketchup::Face
          area = entity.area rescue 0

          if entity.material
            mat_name = entity.material.name
            material_area[mat_name] = (material_area[mat_name] || 0) + area
          end

        when Sketchup::Group
          collect_material_areas(entity.entities, material_area, depth + 1)

        when Sketchup::ComponentInstance
          collect_material_areas(entity.definition.entities, material_area, depth + 1)
        end
      end
    end

    # Face 순회하여 재질-부위 매핑 수집
    def collect_material_locations(entities, material_locations, depth = 0)
      return if depth > 5  # 무한 재귀 방지

      entities.each do |entity|
        case entity
        when Sketchup::Face
          # Face의 방향으로 부위 추정
          location = classify_face_location(entity)

          # 앞면 재질
          if entity.material
            mat_name = entity.material.name
            material_locations[mat_name] ||= []
            material_locations[mat_name] << location
          end

          # 뒷면 재질
          if entity.back_material
            mat_name = entity.back_material.name
            material_locations[mat_name] ||= []
            material_locations[mat_name] << location
          end

        when Sketchup::Group
          # 그룹 이름으로 부위 힌트 얻기
          group_hint = guess_location_from_name(entity.name)
          collect_material_locations_with_hint(entity.entities, material_locations, group_hint, depth + 1)

        when Sketchup::ComponentInstance
          # 컴포넌트 이름으로 부위 힌트 얻기
          comp_hint = guess_location_from_name(entity.definition.name)
          collect_material_locations_with_hint(entity.definition.entities, material_locations, comp_hint, depth + 1)
        end
      end
    end

    # 힌트가 있는 재질 수집
    def collect_material_locations_with_hint(entities, material_locations, hint, depth)
      return if depth > 5

      entities.each do |entity|
        case entity
        when Sketchup::Face
          location = hint || classify_face_location(entity)

          if entity.material
            mat_name = entity.material.name
            material_locations[mat_name] ||= []
            material_locations[mat_name] << location
          end

          if entity.back_material
            mat_name = entity.back_material.name
            material_locations[mat_name] ||= []
            material_locations[mat_name] << location
          end

        when Sketchup::Group
          new_hint = guess_location_from_name(entity.name) || hint
          collect_material_locations_with_hint(entity.entities, material_locations, new_hint, depth + 1)

        when Sketchup::ComponentInstance
          new_hint = guess_location_from_name(entity.definition.name) || hint
          collect_material_locations_with_hint(entity.definition.entities, material_locations, new_hint, depth + 1)
        end
      end
    end

    # Face 방향으로 부위 분류 (바닥/천장/벽)
    def classify_face_location(face)
      normal = face.normal

      # Z축 방향 체크
      if normal.z > 0.7
        "Floor(바닥)"
      elsif normal.z < -0.7
        "Ceiling(천장)"
      else
        "Wall(벽면)"
      end
    end

    # 이름에서 부위 힌트 추출
    def guess_location_from_name(name)
      return nil if name.nil? || name.empty?

      name_lower = name.downcase

      if name_lower.include?('floor') || name_lower.include?('바닥')
        "Floor(바닥)"
      elsif name_lower.include?('ceiling') || name_lower.include?('천장')
        "Ceiling(천장)"
      elsif name_lower.include?('wall') || name_lower.include?('벽')
        "Wall(벽면)"
      elsif name_lower.include?('door') || name_lower.include?('문')
        "Door(문)"
      elsif name_lower.include?('window') || name_lower.include?('창')
        "Window(창문)"
      elsif name_lower.include?('sofa') || name_lower.include?('소파')
        "Furniture-Sofa(소파)"
      elsif name_lower.include?('table') || name_lower.include?('테이블') || name_lower.include?('책상')
        "Furniture-Table(테이블)"
      elsif name_lower.include?('chair') || name_lower.include?('의자')
        "Furniture-Chair(의자)"
      elsif name_lower.include?('cabinet') || name_lower.include?('수납') || name_lower.include?('캐비닛')
        "Furniture-Cabinet(수납장)"
      elsif name_lower.include?('bed') || name_lower.include?('침대')
        "Furniture-Bed(침대)"
      elsif name_lower.include?('lamp') || name_lower.include?('light') || name_lower.include?('조명')
        "Lighting(조명기구)"
      elsif name_lower.include?('plant') || name_lower.include?('식물')
        "Decor-Plant(식물)"
      else
        nil
      end
    end

    # 명도 톤 분류
    def classify_tone(luminance)
      if luminance < 60
        "Very Dark(매우 어두움)"
      elsif luminance < 100
        "Dark(어두움)"
      elsif luminance < 150
        "Medium(중간)"
      elsif luminance < 200
        "Light(밝음)"
      else
        "Very Light(매우 밝음)"
      end
    end

    # 우드 재질 경고 생성
    def generate_wood_warning(materials)
      wood_keywords = ['wood', 'walnut', 'oak', 'teak', 'maple', 'cherry', '원목', '월넛', '오크', '티크', '메이플', '체리']
      wood_materials = materials.select { |m| wood_keywords.any? { |kw| m.name.downcase.include?(kw) } }

      return nil if wood_materials.empty?

      warning_lines = ["\n⚠️ WOOD MATERIAL WARNING (우드 재질 경고):"]
      wood_materials.each do |wm|
        if wm.color
          lum = (0.299 * wm.color.red + 0.587 * wm.color.green + 0.114 * wm.color.blue).to_i
          if lum < 100
            warning_lines << "- \"#{wm.name}\" is DARK WOOD (luminance: #{lum}). DO NOT change to light Oak!"
          else
            warning_lines << "- \"#{wm.name}\" is LIGHT WOOD (luminance: #{lum}). DO NOT change to dark Walnut!"
          end
        end
      end
      warning_lines.join("\n")
    end

    # ========================================
    # 렌더링 프롬프트 빌드
    # ========================================

    # 렌더링 프롬프트 생성
    def build_render_prompt(time_preset, light_switch)
      # 시간대별 조명 설정 (영문으로 상세하게)
      time_desc = case time_preset
      when 'day'
        "Bright natural daylight, midday sun, soft diffused light through windows, blue sky visible outside"
      when 'evening'
        "Golden hour sunset lighting at 5:00 PM, warm orange-amber light rays through windows, dramatic warm tones"
      when 'night'
        "Nighttime 9:00 PM, dark exterior visible through windows, interior lit by artificial lights only"
      else
        "Bright natural daylight"
      end

      # 조명 ON/OFF 설정 (영문으로 상세하게)
      light_desc = case light_switch
      when 'on'
        "Interior lights ON: All ceiling lights, pendant lamps, wall sconces, and floor lamps are illuminated with warm 3000K color temperature. Realistic soft glow from light fixtures."
      when 'off'
        "Interior lights OFF: All artificial lights are turned off. No lamp glow, no ceiling lights, no wall sconces illuminated. Only natural ambient light from windows and skylights."
      else
        "Interior lights ON with warm 3000K tone"
      end

      # 네거티브 프롬프트 처리
      negative_section = <<~NEGATIVE

[NEGATIVE PROMPT - ABSOLUTELY AVOID]
black outlines, visible edges, sketch lines, wireframe appearance, line art style, hard black lines, 3D render look, CGI appearance, computer graphics, architectural visualization, clean perfect surfaces, uniform flat lighting, artificial plastic look, cartoon style, anime style, painting style, illustration, hand-drawn, digital art, concept art, unrealistic colors, oversaturated, HDR artifacts, bloom effects, lens flare, motion blur, added objects, new furniture, mirrors not in original, extra decorations
      NEGATIVE

      if @negative_prompt && !@negative_prompt.empty?
        negative_section += "\nAdditional exclusions: #{@negative_prompt}\n"
      end

      # ★ 아이소메트릭 뷰인 경우 전용 프롬프트 사용
      if @is_isometric
        puts "[NanoBanana] 아이소메트릭 뷰 렌더링 프롬프트 사용"
        return build_isometric_render_prompt(time_desc, light_desc, negative_section)
      end

      # Convert 여부에 따라 다른 프롬프트 생성
      if @converted_prompt && !@converted_prompt.empty?
        # ★ Convert 완료 - AI가 생성한 상세 프롬프트 사용
        puts "[NanoBanana] Convert 모드 - AI 생성 프롬프트 사용"
        puts "[NanoBanana] 조명 설정: #{light_desc}"

        # 조명 설정을 프롬프트 앞에 강조
        lighting_prefix = <<~LIGHTING
[CRITICAL INSTRUCTION - MUST FOLLOW EXACTLY]

This is an IMAGE-TO-IMAGE transformation task.
Your ONLY job is to convert this 3D SketchUp model render into a photorealistic interior photograph.

[ABSOLUTE RULES - VIOLATION = FAILURE]
1. PRESERVE EXACT COMPOSITION: Every wall, floor, ceiling, window, door must remain in the EXACT same position
2. PRESERVE EXACT CAMERA ANGLE: Do not change perspective, viewing angle, or focal length
3. PRESERVE EXACT FURNITURE LAYOUT: Every piece of furniture must stay in its exact location and size
4. NO ADDITIONS: Do NOT add any objects, furniture, decorations, mirrors, handles, plants, or accessories that are not in the source image
5. NO REMOVALS: Do NOT remove any objects that exist in the source image

[LIGHTING SETTINGS - APPLY EXACTLY]
Time of Day: #{time_desc}
Interior Lighting: #{light_desc}

        LIGHTING

        lighting_prefix + @converted_prompt + negative_section
      else
        # Convert 안함 - 기본 렌더링 (상세 프롬프트)
        puts "[NanoBanana] 일반 모드 - 기본 프롬프트"
        <<~PROMPT
[CRITICAL INSTRUCTION - MUST FOLLOW EXACTLY]

This is an IMAGE-TO-IMAGE transformation task.
Your ONLY job is to convert this 3D SketchUp model render into a photorealistic interior photograph.

[ABSOLUTE RULES - VIOLATION = FAILURE]
1. PRESERVE EXACT COMPOSITION: Every wall, floor, ceiling, window, door must remain in the EXACT same position
2. PRESERVE EXACT CAMERA ANGLE: Do not change perspective, viewing angle, or focal length
3. PRESERVE EXACT FURNITURE LAYOUT: Every piece of furniture must stay in its exact location and size
4. NO ADDITIONS: Do NOT add any objects, furniture, decorations, mirrors, handles, plants, or accessories that are not in the source image
5. NO REMOVALS: Do NOT remove any objects that exist in the source image
6. NO MODIFICATIONS: Do NOT resize, move, rotate, or transform any existing objects

[LIGHTING SETTINGS - APPLY EXACTLY]
Time of Day: #{time_desc}
Interior Lighting: #{light_desc}

[PHOTOREALISTIC TRANSFORMATION TASK]
Transform this 3D SketchUp interior render into a professional architectural photograph.
Camera: Canon EOS R5 with 24mm f/2.8 lens, professional architectural photography quality
Quality: High resolution, sharp focus, professional color grading

[MATERIAL RENDERING]
Convert all surfaces to photorealistic materials with natural imperfections:
- Wood surfaces: visible grain texture, subtle scratches, natural wood imperfections
- Wall surfaces: realistic paint texture, subtle shadows, minor surface variations
- Floor surfaces: realistic material texture with wear patterns and reflections
- Glass surfaces: realistic reflections, subtle smudges, proper transparency
- Metal surfaces: realistic reflections, subtle fingerprints, appropriate finish

[PHOTO REALISM DETAILS]
- Natural lens characteristics: subtle vignette, minimal chromatic aberration
- Realistic depth of field with natural bokeh
- Film-like quality with subtle grain (ISO 200-400)
- Professional white balance and color temperature
- Soft natural shadows with realistic falloff
- Global illumination and realistic light bounce
#{negative_section}
        PROMPT
      end
    end

    # ★ 아이소메트릭 전용 렌더링 프롬프트
    def build_isometric_render_prompt(time_desc, light_desc, negative_section)
      # Convert된 프롬프트가 있으면 아이소메트릭 프리픽스와 결합
      iso_prefix = <<~ISO_PREFIX
[CRITICAL INSTRUCTION - ISOMETRIC RENDERING]

This is an IMAGE-TO-IMAGE transformation of an ISOMETRIC (orthographic) interior scene.
Your ONLY job is to convert this 3D SketchUp isometric model into a photorealistic isometric visualization with a PURE WHITE background.

[ABSOLUTE RULES - ISOMETRIC SPECIFIC - VIOLATION = FAILURE]
1. PRESERVE EXACT ISOMETRIC ANGLE: Maintain the orthographic top-down viewing angle. Do NOT convert to perspective view.
2. PRESERVE EXACT LAYOUT: Every wall, floor, ceiling, furniture must remain in the EXACT same position and scale
3. PRESERVE EXACT MATERIALS: Do NOT change floor material (wood, tile, concrete, etc.) or wall color/texture. Keep them IDENTICAL to the source.
4. NO ADDITIONS: Do NOT add any objects, furniture, plants, rugs, decorations, accessories, or items not in the source image
5. NO REMOVALS: Do NOT remove any objects that exist in the source image
6. PURE WHITE BACKGROUND: Area outside the room/building footprint must be PURE WHITE (#FFFFFF). No shadows, gradients, ground plane, or environment outside the building.
7. NO EXTERIOR ENVIRONMENT: Do NOT add sky, trees, landscape, ground texture, or any elements outside the room boundary

[LIGHTING - ISOMETRIC]
Time: #{time_desc}
Lights: #{light_desc}
Soft overhead studio lighting for clean isometric presentation.
Subtle ambient occlusion at wall-floor junctions and furniture bases.
Contact shadows under furniture contained WITHIN the room footprint only.

      ISO_PREFIX

      if @converted_prompt && !@converted_prompt.empty?
        puts "[NanoBanana] 아이소메트릭 + Convert 모드"
        # AI 생성 프롬프트에 아이소 프리픽스 결합
        iso_negative = <<~ISO_NEG

[NEGATIVE PROMPT - ABSOLUTELY AVOID]
perspective view, vanishing points, perspective distortion, background environment, sky, trees, landscape, ground outside room, colored background, gradient background, shadows outside room boundary, added furniture, new objects, extra plants, extra decorations, changed floor material, changed wall color, wireframe, sketch lines, black outlines, cartoon, anime, CGI look, 3D render artifacts, low quality, blurry
        ISO_NEG

        if @negative_prompt && !@negative_prompt.empty?
          iso_negative += "\nAdditional exclusions: #{@negative_prompt}\n"
        end

        iso_prefix + @converted_prompt + iso_negative
      else
        puts "[NanoBanana] 아이소메트릭 기본 모드"
        iso_prefix + <<~ISO_BODY
[PHOTOREALISTIC ISOMETRIC TRANSFORMATION]
Transform this SketchUp isometric model into a photorealistic isometric architectural visualization.
Projection: Orthographic isometric, identical angle to source image.
Quality: High resolution, sharp focus, clean rendering.
Background: Pure white (#FFFFFF) outside room boundary.

[MATERIAL RENDERING - PRESERVE SOURCE]
Enhance existing materials to photorealistic quality WITHOUT changing material types:
- Floor: Keep the SAME material type (wood→photorealistic wood, tile→photorealistic tile)
- Walls: Keep the SAME color and texture, enhance to photorealistic quality
- Furniture: Add realistic textures while preserving exact shape and position
- Glass: Realistic reflections and transparency
- Metal: Realistic reflections with appropriate finish

[ISOMETRIC QUALITY]
- Clean sharp edges on architectural elements
- Consistent isometric scale across all objects
- No perspective distortion
- Professional architectural visualization quality
- Miniature diorama-like photorealistic feel

[NEGATIVE PROMPT - ABSOLUTELY AVOID]
perspective view, vanishing points, perspective distortion, background environment, sky, trees, landscape, ground outside room, colored background, gradient background, shadows outside room boundary, added furniture, new objects, extra plants, extra decorations, changed floor material, changed wall color, wireframe, sketch lines, black outlines, cartoon, anime, CGI look, 3D render artifacts, low quality, blurry, added objects, new furniture, mirrors not in original
        ISO_BODY
      end
    end
  end
end
