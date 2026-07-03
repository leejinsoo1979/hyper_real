// NanoBanana Renderer - Core (state, bridge, DOM cache)
    var state = {
      originalImage: null,
      renderImage: null,
      isRendering: false,
      apiConnected: false,
      converted: false,  // Convert 완료 여부
      timePreset: 'day',
      lightSwitch: 'on',
      imageSize: '1024',  // ★ 속도 우선 (1024px)
      engine: 'replicate',  // ★ Replicate 기본 (구도 유지)
      resultPanels: [{ id: 1, image: null }],  // 결과 패널 목록
      nextResultId: 2,
      currentScene: null,  // 현재 활성 씬 이름
      history: [],  // 히스토리 배열
      nextHistoryId: 1
    };

    // 씬별 상태 저장소
    var sceneStates = new Map();

    // 현재 씬 상태 저장
    function saveCurrentSceneState() {
      if (!state.currentScene) return;

      const promptSource = document.getElementById('prompt-source');
      const promptSourceNegative = document.getElementById('prompt-source-negative');
      const promptResult = document.getElementById('prompt-result');
      const promptResultNegative = document.getElementById('prompt-result-negative');

      sceneStates.set(state.currentScene, {
        originalImage: state.originalImage,
        renderImage: state.renderImage,
        converted: state.converted,
        promptSource: promptSource?.value || '',
        promptSourceNegative: promptSourceNegative?.value || '',
        promptResult: promptResult?.value || '',
        promptResultNegative: promptResultNegative?.value || '',
        resultPanels: JSON.parse(JSON.stringify(state.resultPanels)),
        nextResultId: state.nextResultId
      });

      console.log('[NanoBanana] 씬 상태 저장:', state.currentScene, 'Result 이미지:', state.resultPanels[0]?.image ? '있음' : '없음');
    }

    // 씬 상태 복원 (el 객체 초기화 후 호출됨)
    function restoreSceneState(sceneName) {
      const savedState = sceneStates.get(sceneName);

      const originalImage = document.getElementById('original-image');
      const originalEmpty = document.getElementById('original-empty');
      const renderImage = document.getElementById('render-image');
      const renderEmpty = document.getElementById('render-empty');
      const btnRender = document.getElementById('btn-generate-source');
      const btnEdit = document.getElementById('btn-edit');
      const btnSave = document.getElementById('btn-save');
      const promptSource = document.getElementById('prompt-source');
      const promptSourceNegative = document.getElementById('prompt-source-negative');
      const promptResult = document.getElementById('prompt-result');
      const promptResultNegative = document.getElementById('prompt-result-negative');

      if (savedState) {
        // 저장된 상태 복원
        state.originalImage = savedState.originalImage;
        state.renderImage = savedState.renderImage;
        state.converted = savedState.converted;
        state.resultPanels = savedState.resultPanels;
        state.nextResultId = savedState.nextResultId;

        // UI 복원 - SOURCE 이미지
        if (savedState.originalImage && originalImage) {
          originalImage.src = 'data:image/png;base64,' + savedState.originalImage;
          originalImage.style.display = 'block';
          if (originalEmpty) originalEmpty.style.display = 'none';
        } else {
          if (originalImage) originalImage.style.display = 'none';
          if (originalEmpty) originalEmpty.style.display = 'flex';
        }

        // UI 복원 - RESULT 이미지 (첫번째 resultPanel 사용)
        const firstResult = savedState.resultPanels && savedState.resultPanels[0];
        if (firstResult && firstResult.image && renderImage) {
          renderImage.src = 'data:image/png;base64,' + firstResult.image;
          renderImage.style.display = 'block';
          if (renderEmpty) renderEmpty.style.display = 'none';
          if (btnEdit) btnEdit.disabled = false;
          if (btnSave) btnSave.disabled = false;
        } else if (savedState.renderImage && renderImage) {
          renderImage.src = 'data:image/png;base64,' + savedState.renderImage;
          renderImage.style.display = 'block';
          if (renderEmpty) renderEmpty.style.display = 'none';
          if (btnEdit) btnEdit.disabled = false;
          if (btnSave) btnSave.disabled = false;
        } else {
          if (renderImage) renderImage.style.display = 'none';
          if (renderEmpty) renderEmpty.style.display = 'flex';
          if (btnEdit) btnEdit.disabled = true;
          if (btnSave) btnSave.disabled = true;
        }

        // UI 복원 - 프롬프트
        if (promptSource) promptSource.value = savedState.promptSource || '';
        if (promptSourceNegative) promptSourceNegative.value = savedState.promptSourceNegative || '';
        if (promptResult) promptResult.value = savedState.promptResult || '';
        if (promptResultNegative) promptResultNegative.value = savedState.promptResultNegative || '';

        // Render 버튼 상태
        if (btnRender) btnRender.disabled = !savedState.originalImage || !savedState.promptSource;

        console.log('[NanoBanana] 씬 상태 복원:', sceneName, 'Result 이미지:', firstResult?.image ? '있음' : '없음');
      } else {
        // 새 씬 - 초기 상태로
        state.originalImage = null;
        state.renderImage = null;
        state.converted = false;
        state.resultPanels = [{ id: 1, image: null }];
        state.nextResultId = 2;

        if (originalImage) originalImage.style.display = 'none';
        if (originalEmpty) originalEmpty.style.display = 'flex';
        if (renderImage) renderImage.style.display = 'none';
        if (renderEmpty) renderEmpty.style.display = 'flex';

        if (promptSource) promptSource.value = '';
        if (promptSourceNegative) promptSourceNegative.value = '';
        if (promptResult) promptResult.value = '';
        if (promptResultNegative) promptResultNegative.value = '';

        if (btnRender) btnRender.disabled = true;
        if (btnEdit) btnEdit.disabled = true;
        if (btnSave) btnSave.disabled = true;

        console.log('[NanoBanana] 새 씬 초기화:', sceneName);
      }

      state.currentScene = sceneName;
    }

    // 씬 전환 처리 (Ruby에서 호출)
    window.onSceneChanged = function(sceneName) {
      // 현재 씬 상태 저장
      saveCurrentSceneState();
      // 새 씬 상태 복원
      restoreSceneState(sceneName);
      console.log('[NanoBanana] Scene changed to:', sceneName);
    };

    window.onScenePreviewLoaded = function(sceneName, base64) {
      const savedState = sceneStates.get(sceneName) || {
        renderImage: null,
        converted: false,
        promptSource: '',
        promptSourceNegative: '',
        promptResult: '',
        promptResultNegative: '',
        resultPanels: [{ id: 1, image: null }],
        nextResultId: 2
      };

      savedState.originalImage = base64;
      savedState.converted = true;
      sceneStates.set(sceneName, savedState);

      const activeTab = document.querySelector('.scene-tab.active');
      const isActiveScene = state.currentScene === sceneName ||
        (activeTab && activeTab.dataset.scene === sceneName);

      if (isActiveScene) {
        state.currentScene = sceneName;
        state.originalImage = base64;
        state.converted = true;

        const originalImage = document.getElementById('original-image');
        const originalEmpty = document.getElementById('original-empty');
        if (originalImage) {
          originalImage.src = 'data:image/jpeg;base64,' + base64;
          originalImage.style.display = 'block';
        }
        if (originalEmpty) originalEmpty.style.display = 'none';
      }
    };

    var el = {
      originalImage: document.getElementById('original-image'),
      originalEmpty: document.getElementById('original-empty'),
      renderImage: document.getElementById('render-image'),
      renderEmpty: document.getElementById('render-empty'),
      loading: document.getElementById('loading'),
      loadingSource: document.getElementById('loading-source'),
      btnCapture: document.getElementById('btn-capture'),
      btnRender: document.getElementById('btn-generate-source'),
      btnEdit: document.getElementById('btn-edit'),
      btnSave: document.getElementById('btn-save'),
      btnSettings: document.getElementById('btn-settings'),
      btnAutoPrompt: document.getElementById('btn-auto-prompt'),
      btnAttachSource: document.getElementById('btn-attach-source'),
      btnGenerateSource: document.getElementById('btn-generate-source'),
      statusText: document.getElementById('status-text'),
      statusDot: document.getElementById('status-dot'),
      apiStatus: document.getElementById('api-status'),
      promptSource: document.getElementById('prompt-source'),
      promptSourceNegative: document.getElementById('prompt-source-negative'),
      promptResult: document.getElementById('prompt-result'),
      promptResultNegative: document.getElementById('prompt-result-negative'),
      btnAutoPromptResult: document.getElementById('btn-auto-prompt-result'),
      btnRegenerateResult: document.getElementById('btn-regenerate-1')
    };

    // 프롬프트 탭 전환
    document.querySelectorAll('.prompt-area').forEach(area => {
      area.querySelectorAll('.prompt-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          const tabName = tab.dataset.tab;
          // 탭 활성화
          area.querySelectorAll('.prompt-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          // 컨텐츠 활성화
          area.querySelectorAll('.prompt-content').forEach(c => c.classList.remove('active'));
          area.querySelector(`.prompt-content[data-content="${tabName}"]`).classList.add('active');
        });
      });
    });

    // SketchUp Ruby 콜백 호출
    // HtmlDialog injects window.sketchup. Keep that native bridge before the
    // app-level sketchup wrapper below replaces the global name.
    var sketchupNativeBridge = window.sketchup;

    function callRubyJson(action, ...args) {
      const param = args.length > 0 ? JSON.stringify(args) : '';
      if (sketchupNativeBridge && typeof sketchupNativeBridge[action] === 'function') {
        sketchupNativeBridge[action](param);
        return;
      }
      window.location = 'skp:' + action + '@' + encodeURIComponent(param);
    }

    function callRubyRaw(action, ...args) {
      if (sketchupNativeBridge && typeof sketchupNativeBridge[action] === 'function') {
        sketchupNativeBridge[action](...args);
        return;
      }
      const suffix = args.length > 0 ? '@' + args.map(arg => encodeURIComponent(arg || '')).join('@') : '';
      window.location = 'skp:' + action + suffix;
    }

    var sketchup = {
      captureScene: (size) => callRubyJson('capture_scene', size),
      startRender: (time, light, prompt, negativePrompt, renderId, engine) => callRubyJson('start_render', time, light, prompt, negativePrompt, renderId || '', engine || ''),
      generateAutoPrompt: (style, time, light) => callRubyJson('generate_auto_prompt', style || '', time || 'day', light || 'on'),
      saveImage: () => callRubyJson('save_image', ''),
      openEditor: () => callRubyRaw('open_editor'),
      checkApiStatus: () => callRubyRaw('check_api_status'),
      // Gemini API Key
      saveApiKey: (key) => callRubyRaw('save_api_key', key),
      loadApiKey: () => callRubyRaw('load_api_key'),
      testConnection: () => callRubyRaw('test_connection'),
      // Replicate API
      saveReplicateToken: (token) => callRubyRaw('save_replicate_token', token),
      loadReplicateToken: () => callRubyRaw('load_replicate_token'),
      // Engine selection
      setEngine: (engine) => callRubyRaw('set_engine', engine),
      getEngine: () => callRubyRaw('get_engine'),
      // Model selection
      saveModel: (model) => callRubyRaw('save_model', model),
      loadModel: () => callRubyRaw('load_model'),
      // Camera controls
      camMove: (dir) => callRubyJson('cam_move', dir),
      camRotate: (dir) => callRubyJson('cam_rotate', dir),
      camHeight: (preset) => callRubyJson('cam_height', preset),
      camFov: (preset) => callRubyJson('cam_fov', preset),
      startMirror: () => callRubyRaw('start_mirror'),
      stopMirror: () => callRubyRaw('stop_mirror'),
      // Scene controls
      getScenes: () => callRubyRaw('get_scenes'),
      selectScene: (name) => callRubyRaw('select_scene', name),
      addScene: () => callRubyRaw('add_scene'),
      // 2점 투시
      apply2Point: () => callRubyRaw('apply_2point'),
      // Mix - 선택된 패널의 이미지 전달
      openMix: () => callRubyRaw('open_mix'),
      // 2차 생성 (소스 이미지 base64, 프롬프트, 대상 패널 ID)
      regenerate: (sourceBase64, prompt, panelId) => callRubyRaw('regenerate', sourceBase64, prompt, panelId),
      // 히스토리
      loadHistory: () => callRubyRaw('load_history'),
      saveHistory: (json) => callRubyRaw('save_history', json),
      save_history: (json) => callRubyRaw('save_history', json)
    };
