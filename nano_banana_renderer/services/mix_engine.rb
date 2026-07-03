# frozen_string_literal: true

# NanoBanana Renderer - Mix 엔진
# Mix 다이얼로그, 3D 좌표, 인페인팅, 재질 변경, 평면도→아이소

module NanoBanana
  class << self
    # ========================================
    # Mix 다이얼로그
    # ========================================
    def show_mix_dialog
      unless @current_image
        UI.messagebox('먼저 씬을 캡처하세요.', MB_OK)
        return
      end

      if @mix_dialog && @mix_dialog.visible?
        @mix_dialog.bring_to_front
        return
      end

      options = {
        dialog_title: 'Mix - NanoBanana',
        preferences_key: 'NanoBanana_MixDialog',
        width: 1200,
        height: 750,
        min_width: 1000,
        min_height: 600,
        resizable: true
      }

      @mix_dialog = UI::HtmlDialog.new(options)
      @mix_dialog.set_file(File.join(PLUGIN_ROOT, 'ui/mix_dialog.html'))

      register_mix_callbacks(@mix_dialog)

      @mix_dialog.show
    end

    def register_mix_callbacks(dialog)
      dialog.add_action_callback('mix_get_current_image') do |_ctx|
        if @current_image
          dialog.execute_script("onBaseImageLoaded('#{@current_image}')")
        end
      end

      dialog.add_action_callback('mix_get_3d_coord') do |_ctx, screen_x, screen_y|
        get_3d_coordinate(screen_x.to_i, screen_y.to_i)
      end

      dialog.add_action_callback('mix_get_scene_context') do |_ctx|
        get_scene_context
      end

      dialog.add_action_callback('mix_apply') do |_ctx, data_json|
        apply_mix(data_json)
      end

      dialog.add_action_callback('mix_cancel') do |_ctx|
        @mix_dialog.close
      end
    end

    # ========================================
    # 3D 좌표 및 씬 컨텍스트
    # ========================================

    # 스크린 좌표에서 3D 월드 좌표 추출
    def get_3d_coordinate(screen_x, screen_y)
      begin
        view = Sketchup.active_model.active_view
        result = CoordinateExtractor.screen_to_world(view, screen_x, screen_y)

        if result
          coord_data = {
            position: result[:position],
            normal: result[:normal],
            floor_reference: result[:floor_reference],
            screen_pos: { x: screen_x, y: screen_y }
          }
          @mix_dialog&.execute_script("onCoordReceived('#{coord_data.to_json}')")
        else
          @mix_dialog&.execute_script("onCoordReceived(null)")
        end
      rescue StandardError => e
        puts "[NanoBanana] 3D 좌표 추출 에러: #{e.message}"
        @mix_dialog&.execute_script("onCoordReceived(null)")
      end
    end

    # 씬 컨텍스트 추출 (카메라, 조명, 바운드)
    def get_scene_context
      begin
        view = Sketchup.active_model.active_view
        context = CoordinateExtractor.get_scene_context(view)

        @mix_dialog&.execute_script("onSceneContextLoaded('#{context.to_json}')")
      rescue StandardError => e
        puts "[NanoBanana] 씬 컨텍스트 추출 에러: #{e.message}"
        @mix_dialog&.execute_script("onSceneContextLoaded(null)")
      end
    end

    # ========================================
    # Mix 기능 적용
    # ========================================

    def apply_mix(data_json)
      unless @api_client
        @mix_dialog&.execute_script("onMixError('API Key가 설정되지 않았습니다.')")
        return
      end

      begin
        data = JSON.parse(data_json)
        mode = data['mode']

        Thread.new do
          begin
            result = case mode
            when 'add-remove'
              mix_add_remove(data)
            when 'inpaint'
              mix_inpaint(data)
            when 'material'
              mix_material(data)
            when 'floorplan'
              mix_floorplan(data)
            else
              raise "Unknown mix mode: #{mode}"
            end

            if result && result[:image]
              @current_image = result[:image]
              @mix_dialog&.execute_script("onMixComplete('#{result[:image]}')")
              @main_dialog&.execute_script("onRenderComplete('#{result[:image]}', 'Mix')")
            else
              @mix_dialog&.execute_script("onMixError('결과 이미지를 받지 못했습니다.')")
            end
          rescue StandardError => e
            puts "[NanoBanana] Mix Error: #{e.message}"
            @mix_dialog&.execute_script("onMixError(#{e.message.to_json})")
          end
        end
      rescue StandardError => e
        @mix_dialog&.execute_script("onMixError('데이터 파싱 오류: #{e.message}')")
      end
    end

    # Mix: 요소 추가/삭제 (3D 좌표 기반)
    def mix_add_remove(data)
      base_image = data['baseImage']
      hotspots = data['hotspots'] || []
      instruction = data['instruction'] || ''
      scene_context = data['sceneContext']
      preserve_settings = data['preserveSettings'] || {}

      # 핫스팟 정보를 3D 좌표 기반 프롬프트로 변환
      hotspot_descriptions = hotspots.map.with_index do |h, i|
        pos = h['position'] || {}
        size = h['estimatedSize'] || {}
        rotation = h['rotation'] || 0
        scale = h['scale'] || 1.0

        <<~HOTSPOT
Object #{i + 1} - "#{h['objectName'] || 'Unknown'}":
- World Position: (#{pos['x']&.round || 0}mm, #{pos['y']&.round || 0}mm, #{pos['z']&.round || 0}mm)
- Estimated Size: #{size['width'] || 500}mm W × #{size['depth'] || 500}mm D × #{size['height'] || 800}mm H
- Rotation: #{rotation}° (Z-axis)
- Scale Factor: #{scale}
- Floor Contact: #{h['floorReference'] != false ? 'Yes' : 'No'}
        HOTSPOT
      end.join("\n")

      # 카메라 정보 추출
      camera_info = ""
      if scene_context && scene_context['camera']
        cam = scene_context['camera']
        camera_info = <<~CAMERA
Camera Information (DO NOT CHANGE):
- Eye Position: (#{cam['eye']['x'].round}mm, #{cam['eye']['y'].round}mm, #{cam['eye']['z'].round}mm)
- Target: (#{cam['target']['x'].round}mm, #{cam['target']['y'].round}mm, #{cam['target']['z'].round}mm)
- FOV: #{cam['fov']}°
- Perspective: #{cam['perspective'] ? 'Yes' : 'No (Orthographic)'}
        CAMERA
      end

      # 보존 설정
      preserve_notes = []
      preserve_notes << "- PRESERVE exact camera angle and composition" if preserve_settings['camera'] != false
      preserve_notes << "- PRESERVE all existing furniture positions and materials" if preserve_settings['furniture'] != false
      preserve_notes << "- PRESERVE current lighting setup" if preserve_settings['lighting'] != false
      preserve_notes << "- PRESERVE material textures and colors" if preserve_settings['materials'] != false

      prompt = <<~PROMPT
[INPUT IMAGE = REFERENCE]
Using the provided SketchUp interior scene, add the following objects at their EXACT 3D world coordinates.
All measurements are in millimeters (mm). This is a PARTIAL MODIFICATION - only add the specified objects.

#{camera_info}

Objects to place:
#{hotspot_descriptions}

Additional Instructions: #{instruction}

CRITICAL RULES:
#{preserve_notes.join("\n")}
- Place objects at their EXACT world coordinates with correct perspective
- Match the scale using the provided size estimates (in mm)
- Apply correct rotation around Z-axis as specified
- Objects with "Floor Contact: Yes" must touch the ground plane (Z=0)
- The new objects must have realistic shadows matching scene lighting
- Result should be a photorealistic image, not a 3D model rendering
- DO NOT modify anything else in the scene
      PROMPT

      # 참조 이미지들 수집
      reference_images = hotspots.map { |h| h['objectImage'] }.compact

      if reference_images.any?
        @api_client.generate_with_references(base_image, reference_images, prompt)
      else
        @api_client.generate(base_image, prompt)
      end
    end

    # Mix: 인페인팅 (부분 수정)
    def mix_inpaint(data)
      base_image = data['baseImage']
      mask_image = data['maskImage']
      instruction = data['instruction']

      prompt = <<~PROMPT
Using the provided image, change only the [masked/highlighted area] to [#{instruction}].
Keep everything else in the image exactly the same, preserving the original style, lighting, and composition.

CRITICAL RULES:
- ONLY modify the highlighted/masked area
- Keep ALL other elements, furniture, and background unchanged
- Maintain consistent lighting and shadows
- The edit should blend seamlessly with the rest of the image
- Preserve the exact camera angle and perspective
      PROMPT

      @api_client.generate_with_references(base_image, [mask_image], prompt)
    end

    # Mix: 재질 변경
    def mix_material(data)
      base_image = data['baseImage']
      mask_image = data['maskImage']
      material_image = data['materialImage']
      description = data['description'] || 'the uploaded material'

      prompt = <<~PROMPT
Using the provided interior image, change the material/texture of the [masked area] to match the provided reference material image.

Material description: #{description}

CRITICAL RULES:
- Apply the new material ONLY to the masked area (walls, floor, or specified surface)
- Maintain the exact shape and geometry of the masked area
- Preserve proper perspective and depth when applying the texture
- Keep ALL other elements unchanged (furniture, objects, lighting)
- The new material should have realistic reflections and shadows
- Match the scale and pattern of the material naturally
      PROMPT

      @api_client.generate_with_references(base_image, [mask_image, material_image], prompt)
    end

    # Mix: 평면도 → 아이소메트릭 (벽 높이/두께 파라미터 포함)
    def mix_floorplan(data)
      floorplan_image = data['floorplanImage'] || data['baseImage']
      style = data['style'] || 'modern'
      instruction = data['instruction'] || ''
      wall_height = data['wallHeight'] || 2700  # mm
      wall_thickness = data['wallThickness'] || 150  # mm

      style_descriptions = {
        'modern' => 'Modern minimalist style with clean lines, neutral colors, and contemporary furniture',
        'scandinavian' => 'Scandinavian style with light wood, white walls, cozy textiles, and natural elements',
        'industrial' => 'Industrial style with exposed brick, metal accents, dark tones, and vintage elements',
        'classic' => 'Classic traditional style with elegant furniture, rich colors, and ornate details',
        'luxury' => 'Luxury high-end style with premium materials, designer furniture, and sophisticated lighting'
      }

      style_desc = style_descriptions[style] || style_descriptions['modern']

      prompt = <<~PROMPT
Convert this 2D floor plan into a photorealistic isometric 3D visualization.

ARCHITECTURAL PARAMETERS:
- Wall Height: #{wall_height}mm (#{(wall_height / 1000.0).round(2)}m)
- Wall Thickness: #{wall_thickness}mm (#{(wall_thickness / 10.0).round(1)}cm)
- Units: All measurements in millimeters (mm)

Style: #{style_desc}

Additional instructions: #{instruction}

GENERATION REQUIREMENTS:
1. Analyze the floor plan layout, room dimensions, and spatial arrangement
2. Generate an isometric (30-degree angle) 3D view of the entire space
3. Build walls with EXACT height of #{wall_height}mm and thickness of #{wall_thickness}mm
4. Add appropriate furniture based on room types (bedroom, living room, kitchen, etc.)
5. Include realistic materials for walls, floors, and ceilings
6. Add natural and artificial lighting appropriate for each room
7. Include decorative elements like plants, artwork, and accessories
8. Maintain accurate proportions from the original floor plan
9. The result should be a cohesive, furnished interior in the specified style

SCALE REFERENCE:
- Standard door height: 2100mm
- Standard ceiling height: #{wall_height}mm
- Human eye level: 1600mm
- Standard furniture proportions based on these references

Output: High-quality isometric rendering with furniture, materials, and lighting
      PROMPT

      @api_client.generate(floorplan_image, prompt)
    end
  end
end
