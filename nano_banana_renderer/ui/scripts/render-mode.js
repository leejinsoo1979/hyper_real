// NanoBanana Renderer - Render Mode (capture, render, settings, camera, scenes)
    let mirrorActive = false;
    let selectedPanel = 'source'; // 'source' or 'result'

    // 패널 선택 기능
    function selectPanel(panelType) {
      selectedPanel = panelType;

      // 모든 패널에서 selected 클래스 제거
      document.querySelectorAll('.image-panel').forEach(p => p.classList.remove('selected'));

      // 선택된 패널에 selected 클래스 추가
      if (panelType === 'source') {
        document.getElementById('source-panel').classList.add('selected');
      } else {
        document.getElementById('result-panel-1').classList.add('selected');
      }
    }

    // 선택된 패널의 이미지 가져오기
    function getSelectedImage() {
      if (selectedPanel === 'source') {
        return state.originalImage;
      } else {
        return state.renderImage;
      }
    }

    function onCaptureComplete(base64, materialCount) {
      // 노드 에디터 콜백이 있으면 우선 처리
      if (window._nodeSourceCallback) {
        window._nodeSourceCallback(base64);
        window._nodeSourceCallback = null;
        return;
      }

      state.originalImage = base64;
      el.originalImage.src = 'data:image/png;base64,' + base64;
      el.originalImage.style.display = 'block';
      el.originalEmpty.style.display = 'none';
      setStatus('Analyzing scene...');
      // Render 버튼은 onConvertComplete에서 활성화
    }

    // Convert 진행 상황 업데이트 (Ruby에서 호출)
    function updateConvertProgress(stage, detail) {
      const loadingText = el.loadingSource.querySelector('.loading-text');
      const loadingSubtext = el.loadingSource.querySelector('.loading-subtext');
      if (loadingText) loadingText.textContent = stage;
      if (loadingSubtext) loadingSubtext.textContent = detail;
      setStatus(stage + ' - ' + detail);
    }

    // Convert 에러 (Ruby에서 호출)
    function onConvertError(errorMsg) {
      stopConvertProgress(false);
      el.btnCapture.disabled = false;
      el.btnCapture.textContent = 'Convert';
      el.loadingSource.classList.add('hidden');
      setStatus('Convert 실패: ' + errorMsg);
    }

    // Capture 에러 (Ruby에서 호출)
    function onCaptureError(errorMsg) {
      onConvertError(errorMsg);
    }

    // Convert 완료 (씬 분석 완료 - 프롬프트는 별도)
    function onConvertComplete(promptText) {
      stopConvertProgress(true);
      state.converted = true;
      el.btnCapture.disabled = false;
      el.btnCapture.textContent = 'Convert';

      // 100% 표시 후 로딩 숨김
      setTimeout(() => {
        el.loadingSource.classList.add('hidden');
      }, 500);

      // 프롬프트창 활성화 (비워둠 - 사용자가 직접 입력하거나 Auto 사용)
      el.promptSource.value = '';
      el.promptSource.disabled = false;
      el.promptSource.placeholder = '직접 입력하거나 Auto 버튼으로 자동 생성하세요.';
      el.promptSourceNegative.value = '';
      el.promptSourceNegative.disabled = false;

      // Auto 버튼 및 기타 버튼 활성화
      el.btnAutoPrompt.disabled = false;
      el.btnAttachSource.disabled = false;
      el.btnGenerateSource.disabled = false;

      // Render 버튼은 프롬프트 입력 후 활성화 (또는 Auto 후)
      el.btnRender.disabled = true;

      setStatus('Convert 완료 - 프롬프트를 입력하거나 Auto 생성하세요');
    }

    // Auto 프롬프트 진행 상태 (취소 후 늦게 도착한 결과 무시용)
    let autoPromptActive = false;

    // Auto 프롬프트 생성 시작
    function onAutoPromptStart() {
      autoPromptActive = true;
      el.btnAutoPrompt.disabled = true;
      el.btnAutoPrompt.classList.add('loading');
      el.btnAutoPrompt.innerHTML = `
        <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 6v6l4 2"></path>
        </svg>
        생성중...
      `;

      // SOURCE 영역에 로딩 오버레이 + 프로그레스 바 표시
      el.loadingSource.innerHTML = `
        <div class="auto-prompt-loading">
          <div class="loading-spinner"></div>
          <div class="loading-status">프롬프트 생성 중...</div>
          <div class="loading-detail">씬 분석 및 재질 정보 추출</div>
          <div class="prompt-progress-container">
            <div class="prompt-progress-bar" id="prompt-progress-bar"></div>
          </div>
          <div class="prompt-progress-text" id="prompt-progress-text">0%</div>
          <button class="btn btn-secondary" id="btn-cancel-auto-prompt" style="margin-top:12px; padding:6px 20px;">취소</button>
        </div>
      `;
      el.loadingSource.classList.remove('hidden');

      // 취소 버튼 연결
      const cancelBtn = document.getElementById('btn-cancel-auto-prompt');
      if (cancelBtn) cancelBtn.onclick = cancelAutoPrompt;

      // 안전장치: 150초 안에 응답 없으면 강제로 에러 처리 (무한 로딩 방지)
      clearAutoPromptWatchdog();
      autoPromptWatchdog = setTimeout(function() {
        onAutoPromptError('시간 초과 (150초) - 다시 시도하세요');
      }, 150000);

      // 프로그레스 애니메이션 시작
      startPromptProgress();

      setStatus('Auto 프롬프트 생성 중...');
    }

    // Auto 프롬프트 안전장치 타이머
    let autoPromptWatchdog = null;

    function clearAutoPromptWatchdog() {
      if (autoPromptWatchdog) {
        clearTimeout(autoPromptWatchdog);
        autoPromptWatchdog = null;
      }
    }

    // Auto 프롬프트 취소
    function cancelAutoPrompt() {
      // 화면 복구를 먼저 하고, SketchUp 통신은 마지막에 (통신 실패해도 UI는 반드시 복구)
      autoPromptActive = false;
      clearAutoPromptWatchdog();
      if (promptProgressInterval) {
        clearInterval(promptProgressInterval);
        promptProgressInterval = null;
      }
      el.btnAutoPrompt.disabled = false;
      el.btnAutoPrompt.classList.remove('loading');
      el.btnAutoPrompt.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
          <path d="M2 17l10 5 10-5"></path>
          <path d="M2 12l10 5 10-5"></path>
        </svg>
        Auto
      `;
      el.loadingSource.innerHTML = '';
      el.loadingSource.classList.add('hidden');
      setStatus('Auto 프롬프트 취소됨');
      try {
        sketchup.cancel_auto_prompt();
      } catch (e) {
        // 브릿지 호출 실패해도 UI는 이미 복구됨
      }
    }

    // 프롬프트 생성 프로그레스 변수
    let promptProgressInterval = null;
    let promptProgressValue = 0;

    // 프롬프트 생성 프로그레스 시작
    function startPromptProgress() {
      promptProgressValue = 0;
      promptProgressInterval = setInterval(() => {
        // 90%까지만 자동 증가 (완료 시 100%로 점프)
        if (promptProgressValue < 90) {
          promptProgressValue += Math.random() * 8 + 2;
          if (promptProgressValue > 90) promptProgressValue = 90;
          updatePromptProgress(promptProgressValue);
        }
      }, 500);
    }

    // 프롬프트 생성 프로그레스 업데이트
    function updatePromptProgress(value) {
      const bar = document.getElementById('prompt-progress-bar');
      const text = document.getElementById('prompt-progress-text');
      if (bar) bar.style.width = value + '%';
      if (text) text.textContent = Math.round(value) + '%';
    }

    // 프롬프트 생성 프로그레스 정지
    function stopPromptProgress() {
      if (promptProgressInterval) {
        clearInterval(promptProgressInterval);
        promptProgressInterval = null;
      }
      updatePromptProgress(100);
    }

    // Auto 프롬프트 생성 완료
    function onAutoPromptComplete(mainPrompt, negativePrompt) {
      if (!autoPromptActive) return; // 취소 후 늦게 도착한 결과 무시
      autoPromptActive = false;
      clearAutoPromptWatchdog();
      // 노드 에디터 Auto 콜백이 있으면 우선 처리
      if (window._nodeAutoPromptCallback) {
        window._nodeAutoPromptCallback(mainPrompt);
        // negative도 노드에 저장
        const negInput = document.getElementById('node-prompt-negative-input');
        if (negInput && negativePrompt) {
          negInput.value = negativePrompt;
          const node = nodeEditor.nodes.find(n => n.id === nodeEditor.selectedNode && n.type === 'renderer');
          if (node) node.data.negativePrompt = negativePrompt;
        }
        return;
      }

      // 프로그레스 100%로 완료
      stopPromptProgress();

      el.btnAutoPrompt.disabled = false;
      el.btnAutoPrompt.classList.remove('loading');
      el.btnAutoPrompt.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
          <path d="M2 17l10 5 10-5"></path>
          <path d="M2 12l10 5 10-5"></path>
        </svg>
        Auto
      `;

      // 잠시 후 SOURCE 영역 로딩 해제 (100% 보여주고)
      setTimeout(() => {
        el.loadingSource.innerHTML = '';
        el.loadingSource.classList.add('hidden');
      }, 300);

      // 프롬프트창에 표시
      el.promptSource.value = mainPrompt || '';
      el.promptSourceNegative.value = negativePrompt || '';

      // Render 버튼 활성화
      el.btnRender.disabled = false;

      setStatus('Auto 프롬프트 생성 완료 - Render 가능');
    }

    // Auto 프롬프트 생성 에러
    function onAutoPromptError(errorMsg) {
      if (!autoPromptActive) return; // 취소 후 늦게 도착한 에러 무시
      autoPromptActive = false;
      clearAutoPromptWatchdog();
      // 프로그레스 정지
      if (promptProgressInterval) {
        clearInterval(promptProgressInterval);
        promptProgressInterval = null;
      }

      el.btnAutoPrompt.disabled = false;
      el.btnAutoPrompt.classList.remove('loading');
      el.btnAutoPrompt.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
          <path d="M2 17l10 5 10-5"></path>
          <path d="M2 12l10 5 10-5"></path>
        </svg>
        Auto
      `;

      // SOURCE 영역에 에러 표시
      el.loadingSource.innerHTML = `
        <div class="auto-prompt-error">
          <span style="color: #ff6b6b;">프롬프트 생성 실패</span>
          <span style="font-size: 11px; color: #888;">${errorMsg}</span>
        </div>
      `;
      el.loadingSource.classList.remove('hidden');
      // 3초 후 에러 메시지 숨김
      setTimeout(() => {
        el.loadingSource.innerHTML = '';
        el.loadingSource.classList.add('hidden');
      }, 3000);

      setStatus('Auto 프롬프트 실패: ' + errorMsg);
    }

    // 렌더링 중인 씬 목록 관리
    const renderingScenes = new Map(); // sceneName -> { startTime }

    function onRenderStart(sceneName) {
      state.isRendering = true;
      el.loading.classList.remove('hidden');
      // Render 버튼은 활성화 상태 유지 (연속 렌더링 가능)
      // el.btnRender.disabled = true;

      // 해당 씬 탭에 로딩 표시
      if (sceneName) {
        renderingScenes.set(sceneName, { startTime: Date.now() });
        updateSceneTabStatus(sceneName, 'rendering');
      }

      setStatus('Rendering: ' + (sceneName || 'Unknown'));
    }

    function onRenderComplete(base64, sceneName, panelId = 1) {

      state.renderImage = base64;

      // 해당 패널의 결과 이미지 저장
      const panelData = state.resultPanels.find(p => p.id === panelId);
      if (panelData) panelData.image = base64;

      el.renderImage.src = 'data:image/png;base64,' + base64;
      el.renderImage.style.display = 'block';
      el.renderEmpty.style.display = 'none';
      el.loading.classList.add('hidden');
      el.btnRender.disabled = false;
      el.btnEdit.disabled = false;
      el.btnSave.disabled = false;

      // RESULT 프롬프트 영역 활성화 (2차 생성용)
      el.promptResult.disabled = false;
      el.promptResult.placeholder = '2차 생성용 프롬프트를 입력하세요.';
      el.promptResultNegative.disabled = false;
      el.btnAutoPromptResult.disabled = false;
      el.btnRegenerateResult.disabled = false;

      // 해당 씬 탭 상태 업데이트
      if (sceneName) {
        renderingScenes.delete(sceneName);
        updateSceneTabStatus(sceneName, 'complete');
        // 3초 후 상태 초기화
        setTimeout(() => updateSceneTabStatus(sceneName, 'normal'), 3000);
      }

      // 다른 씬이 아직 렌더링 중인지 확인
      state.isRendering = renderingScenes.size > 0;

      // 히스토리에 추가
      addToHistory(base64, sceneName || 'Unknown');

      setStatus('Complete: ' + (sceneName || 'Unknown'));
    }

    // ===== 노드 에디터 병렬 렌더링 콜백 =====
    // 노드별 콜백 맵 (render_id → resolve function)
    window._nodeRendererCallbacks = {};

    function onNodeRenderComplete(renderId, base64) {
      console.log('[Node] Render complete:', renderId, 'size:', base64 ? base64.length : 0);
      const cb = window._nodeRendererCallbacks[renderId];
      if (cb) {
        cb({ success: true, image: base64 });
        delete window._nodeRendererCallbacks[renderId];
      } else {
        console.warn('[Node] No callback for:', renderId);
      }
    }

    function onNodeRenderError(renderId, errorMsg) {
      console.error('[Node] Render error:', renderId, errorMsg);
      const cb = window._nodeRendererCallbacks[renderId];
      if (cb) {
        cb({ success: false, error: errorMsg });
        delete window._nodeRendererCallbacks[renderId];
      }
    }

    // 히스토리에 추가
    function addToHistory(image, sceneName) {
      const historyItem = {
        id: state.nextHistoryId++,
        image: image,
        scene: sceneName,
        timestamp: Date.now(),
        prompt: el.promptSource?.value || '',
        negativePrompt: el.promptSourceNegative?.value || ''
      };

      state.history.unshift(historyItem);

      // 최대 500개 유지
      if (state.history.length > 500) {
        state.history = state.history.slice(0, 500);
      }

      // 파일에 저장
      sketchup.save_history(JSON.stringify(state.history));

      // 갤러리 업데이트
      renderHistoryGallery();

      // 노드 에디터 히스토리에도 추가 (source: 'render'로 구분)
      if (window.nodeEditor && nodeEditor.saveToHistory) {
        nodeEditor.saveToHistory({
          image: image,
          prompt: historyItem.prompt,
          negativePrompt: historyItem.negativePrompt,
          nodeType: 'render',
          source: 'render'
        });
      }
    }

    // 히스토리 갤러리 렌더링
    function renderHistoryGallery() {
      const gallery = document.getElementById('history-gallery');
      if (!gallery) return;

      gallery.innerHTML = '';

      state.history.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `<img src="data:image/png;base64,${item.image}" alt="${item.scene}">`;
        div.onclick = () => loadHistoryItem(item);
        gallery.appendChild(div);
      });
    }

    // 히스토리 아이템 로드
    function loadHistoryItem(item) {
      state.renderImage = item.image;
      el.renderImage.src = 'data:image/png;base64,' + item.image;
      el.renderImage.style.display = 'block';
      el.renderEmpty.style.display = 'none';

      if (item.prompt) el.promptSource.value = item.prompt;
      if (item.negativePrompt) el.promptSourceNegative.value = item.negativePrompt;
    }

    // 히스토리 로드 콜백 (Ruby에서 호출)
    function onHistoryLoaded(historyArray) {
      console.log('[NanoBanana] 히스토리 로드:', historyArray.length, '개');
      state.history = historyArray || [];
      state.nextHistoryId = state.history.length > 0 ? Math.max(...state.history.map(h => h.id || 0)) + 1 : 1;
      renderHistoryGallery();
    }

    function onRenderError(msg, sceneName) {
      el.loading.classList.add('hidden');
      el.btnRender.disabled = false;

      // 해당 씬 탭 상태 업데이트
      if (sceneName) {
        renderingScenes.delete(sceneName);
        updateSceneTabStatus(sceneName, 'error');
        // 5초 후 상태 초기화
        setTimeout(() => updateSceneTabStatus(sceneName, 'normal'), 5000);
      }

      // 다른 씬이 아직 렌더링 중인지 확인
      state.isRendering = renderingScenes.size > 0;

      setStatus('Error: ' + msg);
    }

    // 씬 탭 상태 업데이트
    function updateSceneTabStatus(sceneName, status) {
      const tabs = document.querySelectorAll('.scene-tab');
      tabs.forEach(tab => {
        if (tab.dataset.scene === sceneName) {
          // 기존 상태 클래스 제거
          tab.classList.remove('rendering', 'render-complete', 'render-error');

          // 스피너 제거/추가
          const existingSpinner = tab.querySelector('.scene-tab-spinner');
          if (existingSpinner) existingSpinner.remove();

          if (status === 'rendering') {
            tab.classList.add('rendering');
            // 스피너 추가
            const spinner = document.createElement('div');
            spinner.className = 'scene-tab-spinner';
            tab.insertBefore(spinner, tab.firstChild);
          } else if (status === 'complete') {
            tab.classList.add('render-complete');
          } else if (status === 'error') {
            tab.classList.add('render-error');
          }
        }
      });
    }

    function onApiStatusUpdate(connected) {
      state.apiConnected = connected;
      el.statusDot.classList.toggle('connected', connected);
      el.apiStatus.textContent = connected ? 'Connected' : 'Disconnected';
    }

    // 렌더링 타이머
    let renderStartTime = null;
    let renderTimerInterval = null;
    const loadingText = document.getElementById('loading-text');

    function startRenderTimer() {
      renderStartTime = Date.now();
      if (renderTimerInterval) clearInterval(renderTimerInterval);
      renderTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - renderStartTime) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        const timeStr = mins > 0 ? `${mins}분 ${secs}초` : `${secs}초`;
        el.statusText.textContent = `AI 이미지 생성중... ${timeStr}`;
        if (loadingText) loadingText.textContent = `AI 이미지 생성중... ${timeStr}`;
      }, 1000);
    }

    function stopRenderTimer(finalStatus) {
      if (renderTimerInterval) {
        clearInterval(renderTimerInterval);
        renderTimerInterval = null;
      }
      if (renderStartTime) {
        const elapsed = Math.floor((Date.now() - renderStartTime) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        const timeStr = mins > 0 ? `${mins}분 ${secs}초` : `${secs}초`;
        el.statusText.textContent = finalStatus ? `${finalStatus} (${timeStr})` : `완료 (${timeStr})`;
        renderStartTime = null;
      } else {
        el.statusText.textContent = finalStatus || 'Ready';
      }
    }

    function setStatus(text) {
      // 렌더링 완료/에러 시 타이머 멈추고 상태 표시
      const lowerText = text.toLowerCase();
      if (lowerText.includes('complete') || lowerText.includes('done') || lowerText.includes('error') || lowerText.includes('failed')) {
        stopRenderTimer(text);
      } else if (!renderTimerInterval) {
        el.statusText.textContent = text;
      }
    }

    // Convert 진행률 관리
    let convertProgressInterval = null;
    const convertSteps = [
      { percent: 5, text: 'Preparing', subtext: 'Initializing...' },
      { percent: 15, text: 'Converting', subtext: 'Capturing scene' },
      { percent: 30, text: 'Converting', subtext: 'Processing image' },
      { percent: 50, text: 'Converting', subtext: 'Analyzing scene' },
      { percent: 70, text: 'Converting', subtext: 'Generating prompt' },
      { percent: 85, text: 'Converting', subtext: 'Finalizing' },
      { percent: 95, text: 'Converting', subtext: 'Almost done' }
    ];
    let convertStepIndex = 0;

    function updateConvertProgress(percent, text, subtext) {
      const percentEl = document.getElementById('loading-percent-source');
      const subtextEl = document.getElementById('loading-subtext-source');
      const barEl = document.getElementById('loading-bar-source');

      if (percentEl) percentEl.textContent = percent + '%';
      if (subtextEl) subtextEl.textContent = subtext;
      if (barEl) {
        barEl.classList.remove('indeterminate');
        barEl.style.width = percent + '%';
      }
    }

    function startConvertProgress() {
      convertStepIndex = 0;
      updateConvertProgress(0, 'Converting', 'Preparing');

      convertProgressInterval = setInterval(() => {
        if (convertStepIndex < convertSteps.length) {
          const step = convertSteps[convertStepIndex];
          updateConvertProgress(step.percent, step.text, step.subtext);
          convertStepIndex++;
        }
      }, 800);
    }

    function stopConvertProgress(success = true) {
      if (convertProgressInterval) {
        clearInterval(convertProgressInterval);
        convertProgressInterval = null;
      }
      if (success) {
        updateConvertProgress(100, 'Complete', 'Done!');
      }
    }

    el.btnCapture.addEventListener('click', () => {
      setStatus('Converting...');
      el.btnCapture.disabled = true;
      el.btnCapture.textContent = 'Converting...';
      el.loadingSource.classList.remove('hidden');
      startConvertProgress();
      sketchup.captureScene(state.imageSize);
    });

    el.btnRender.addEventListener('click', () => {
      startRenderTimer();
      const prompt = el.promptSource.value || '';
      const negativePrompt = el.promptSourceNegative.value || '';
      sketchup.startRender(state.timePreset, state.lightSwitch, prompt, negativePrompt);
    });

    // Auto 프롬프트 버튼 - 바로 생성 (현재 라이팅 설정 전달)
    el.btnAutoPrompt.addEventListener('click', () => {
      sketchup.generateAutoPrompt('', state.timePreset, state.lightSwitch);
    });

    // 프롬프트 입력 시 Render 버튼 활성화
    el.promptSource.addEventListener('input', () => {
      if (state.converted && el.promptSource.value.trim()) {
        el.btnRender.disabled = false;
      } else if (state.converted) {
        el.btnRender.disabled = true;
      }
    });

    el.btnSave.addEventListener('click', () => sketchup.saveImage());
    el.btnEdit.addEventListener('click', () => sketchup.openEditor());
    el.btnSettings.addEventListener('click', () => openSettingsPanel());

    // 설정 화면 열기/닫기
    function openSettingsPanel() {
      document.getElementById('render-main-area').style.display = 'none';
      document.getElementById('settings-main-area').style.display = 'flex';
      sketchup.loadApiKey();
    }

    function closeSettingsPanel() {
      document.getElementById('settings-main-area').style.display = 'none';
      document.getElementById('render-main-area').style.display = 'flex';
    }

    // 설정 화면 이벤트
    document.getElementById('btn-close-settings').addEventListener('click', closeSettingsPanel);

    document.getElementById('btn-toggle-api-key').addEventListener('click', function() {
      const input = document.getElementById('settings-api-key');
      if (input.type === 'password') {
        input.type = 'text';
        this.textContent = '🙈';
      } else {
        input.type = 'password';
        this.textContent = '👁️';
      }
    });

    document.getElementById('btn-test-api').addEventListener('click', function() {
      const input = document.getElementById('settings-api-key');
      const apiKey = input.value.trim();
      const hasStoredKey = input.placeholder && input.placeholder.includes('저장됨');

      // 새로 입력한 키가 없고, 저장된 키도 없으면 에러
      if (!apiKey && !hasStoredKey) {
        document.getElementById('settings-status-dot').className = 'settings-status-dot error';
        document.getElementById('settings-status-text').textContent = 'API Key를 입력하세요';
        return;
      }

      document.getElementById('settings-status-dot').className = 'settings-status-dot testing';
      document.getElementById('settings-status-text').textContent = '테스트 중...';

      // 새 키 입력했으면 저장 후 테스트, 아니면 바로 테스트
      if (apiKey) {
        sketchup.saveApiKey(apiKey);
        setTimeout(() => sketchup.testConnection(), 500);
      } else {
        sketchup.testConnection();
      }
    });

    document.getElementById('btn-save-settings').addEventListener('click', function() {
      const apiKey = document.getElementById('settings-api-key').value.trim();
      if (apiKey) {
        sketchup.saveApiKey(apiKey);
      }
      closeSettingsPanel();
    });

    // Ruby 콜백: API Key 로드 완료
    window.onApiKeyLoaded = function(maskedKey) {
      const input = document.getElementById('settings-api-key');
      const statusDot = document.getElementById('settings-status-dot');
      const statusText = document.getElementById('settings-status-text');

      if (maskedKey && maskedKey.length > 0) {
        input.placeholder = maskedKey + ' (저장됨)';
        input.value = '';
        // API 키가 있으면 연결 상태도 표시
        statusDot.className = 'settings-status-dot success';
        statusText.textContent = '연결됨 (저장된 키 사용중)';
      } else {
        input.placeholder = 'API Key를 입력하세요';
        statusDot.className = 'settings-status-dot error';
        statusText.textContent = 'API Key를 입력하세요';
      }
    };

    // Ruby 콜백: 연결 테스트 결과
    window.onConnectionTestResult = function(success, message) {
      if (success) {
        document.getElementById('settings-status-dot').className = 'settings-status-dot success';
        document.getElementById('settings-status-text').textContent = '연결 성공';
      } else {
        document.getElementById('settings-status-dot').className = 'settings-status-dot error';
        document.getElementById('settings-status-text').textContent = '연결 실패: ' + message;
      }
    };

    // 패널 선택 이벤트
    document.getElementById('source-panel').addEventListener('click', (e) => {
      // 버튼 클릭은 제외
      if (e.target.closest('button')) return;
      selectPanel('source');
    });

    document.getElementById('result-panel-1').addEventListener('click', (e) => {
      // 버튼 클릭은 제외
      if (e.target.closest('button')) return;
      selectPanel('result');
    });

    // 초기 선택: source
    selectPanel('source');

    // RESULT 패널 2차 생성 버튼
    el.btnRegenerateResult.addEventListener('click', () => {
      if (!state.renderImage) return;
      const prompt = el.promptResult.value || el.promptSource.value || '';
      const negativePrompt = el.promptResultNegative.value || el.promptSourceNegative.value || '';
      sketchup.startRender(state.timePreset, state.lightSwitch, prompt, negativePrompt);
    });

    // RESULT Auto 버튼 - 바로 생성 (현재 라이팅 설정 전달)
    el.btnAutoPromptResult.addEventListener('click', () => {
      sketchup.generateAutoPrompt('', state.timePreset, state.lightSwitch);
    });

    document.querySelectorAll('#time-group .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#time-group .seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.timePreset = btn.dataset.time;
      });
    });

    document.querySelectorAll('#light-group .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#light-group .seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.lightSwitch = btn.dataset.light;
      });
    });

    // ★ Engine buttons (Gemini / Replicate)
    document.querySelectorAll('#engine-group .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#engine-group .seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.engine = btn.dataset.engine;
        sketchup.setEngine(btn.dataset.engine);
        // 모델 드롭다운 필터링 (해당 엔진 모델만 표시)
        updateModelDropdownForEngine(btn.dataset.engine);
      });
    });

    // 엔진에 따라 모델 드롭다운 필터링
    function updateModelDropdownForEngine(engine) {
      const items = document.querySelectorAll('#model-dropdown-menu .dropdown-item');
      items.forEach(item => {
        if (item.dataset.engine === engine) {
          item.style.display = 'block';
        } else {
          item.style.display = 'none';
        }
      });
      // 첫 번째 보이는 모델 선택
      const firstVisible = document.querySelector(`#model-dropdown-menu .dropdown-item[data-engine="${engine}"]`);
      if (firstVisible) {
        firstVisible.click();
      }
    }

    // Replicate 토큰 로드 콜백
    function onReplicateTokenLoaded(maskedToken) {
      console.log('Replicate token loaded:', maskedToken ? 'exists' : 'none');
    }

    // 엔진 로드 콜백
    function onEngineLoaded(engine) {
      state.engine = engine;
      document.querySelectorAll('#engine-group .seg-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.engine === engine);
      });
      updateModelDropdownForEngine(engine);
    }

    // Size buttons
    document.querySelectorAll('#size-group .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#size-group .seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.imageSize = btn.dataset.size;
      });
    });

    // Mirror button
    const btnMirror = document.getElementById('btn-mirror');
    btnMirror.addEventListener('click', () => {
      mirrorActive = !mirrorActive;
      btnMirror.classList.toggle('active', mirrorActive);
      btnMirror.textContent = mirrorActive ? 'Mirror ON' : 'Mirror';
      if (mirrorActive) {
        sketchup.startMirror();
      } else {
        sketchup.stopMirror();
      }
    });

    // Mirror update callback (Ruby에서 호출) - 최적화
    let mirrorImageReady = true;
    function onMirrorUpdate(base64) {
      if (!mirrorActive || !mirrorImageReady) return;

      mirrorImageReady = false;
      state.originalImage = base64;

      // 직접 src 교체 (새 Image 객체 없이)
      el.originalImage.src = 'data:image/jpeg;base64,' + base64;
      el.originalImage.style.display = 'block';
      el.originalEmpty.style.display = 'none';

      // 다음 프레임 즉시 허용
      mirrorImageReady = true;
    }

    // 미러링 상태 설정 (Ruby에서 호출)
    function setMirrorActive(active) {
      mirrorActive = active;
      btnMirror.classList.toggle('active', active);
      btnMirror.textContent = active ? 'Mirror ON' : 'Mirror';
    }

    // 2점 투시 버튼
    document.getElementById('btn-2point').addEventListener('click', () => sketchup.apply2Point());

    // Camera movement buttons
    document.getElementById('cam-forward').addEventListener('click', () => sketchup.camMove('forward'));
    document.getElementById('cam-back').addEventListener('click', () => sketchup.camMove('back'));
    document.getElementById('cam-left').addEventListener('click', () => sketchup.camMove('left'));
    document.getElementById('cam-right').addEventListener('click', () => sketchup.camMove('right'));
    document.getElementById('cam-up').addEventListener('click', () => sketchup.camMove('up'));
    document.getElementById('cam-down').addEventListener('click', () => sketchup.camMove('down'));
    document.getElementById('cam-rot-left').addEventListener('click', () => sketchup.camRotate('left'));
    document.getElementById('cam-rot-right').addEventListener('click', () => sketchup.camRotate('right'));

    // Camera height presets
    document.querySelectorAll('#height-group .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#height-group .seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        sketchup.camHeight(btn.dataset.height);
      });
    });

    // Camera FOV presets
    document.querySelectorAll('#fov-group .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#fov-group .seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        sketchup.camFov(btn.dataset.fov);
      });
    });

    // WASD 키보드 컨트롤
    const keyMap = {
      'w': { action: 'move', dir: 'forward', btn: 'cam-forward' },
      'W': { action: 'move', dir: 'forward', btn: 'cam-forward' },
      's': { action: 'move', dir: 'back', btn: 'cam-back' },
      'S': { action: 'move', dir: 'back', btn: 'cam-back' },
      'a': { action: 'move', dir: 'left', btn: 'cam-left' },
      'A': { action: 'move', dir: 'left', btn: 'cam-left' },
      'd': { action: 'move', dir: 'right', btn: 'cam-right' },
      'D': { action: 'move', dir: 'right', btn: 'cam-right' },
      'q': { action: 'move', dir: 'up', btn: 'cam-up' },
      'Q': { action: 'move', dir: 'up', btn: 'cam-up' },
      'e': { action: 'move', dir: 'down', btn: 'cam-down' },
      'E': { action: 'move', dir: 'down', btn: 'cam-down' },
      'z': { action: 'rotate', dir: 'left', btn: 'cam-rot-left' },
      'Z': { action: 'rotate', dir: 'left', btn: 'cam-rot-left' },
      'x': { action: 'rotate', dir: 'right', btn: 'cam-rot-right' },
      'X': { action: 'rotate', dir: 'right', btn: 'cam-rot-right' }
    };

    const activeKeys = new Set();
    const keyIntervals = {};

    document.addEventListener('keydown', (e) => {
      console.log('[키보드] keydown:', e.key, 'target:', e.target.tagName);

      // 텍스트 입력 필드에서만 무시 (슬라이더는 허용)
      if (e.target.tagName === 'TEXTAREA') return;
      if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;

      const mapping = keyMap[e.key];
      console.log('[키보드] mapping:', mapping);
      if (mapping) {
        const key = e.key.toLowerCase();

        // 버튼 활성화 표시
        const btn = document.getElementById(mapping.btn);
        if (btn) btn.classList.add('active-key');

        // 처음 누를 때만 interval 시작
        if (!activeKeys.has(key)) {
          activeKeys.add(key);
          console.log('[키보드] 실행:', mapping.action, mapping.dir);

          // 즉시 실행
          if (mapping.action === 'move') {
            sketchup.camMove(mapping.dir);
          } else if (mapping.action === 'rotate') {
            sketchup.camRotate(mapping.dir);
          }

          // 반복 실행 (100ms 간격)
          keyIntervals[key] = setInterval(() => {
            if (mapping.action === 'move') {
              sketchup.camMove(mapping.dir);
            } else if (mapping.action === 'rotate') {
              sketchup.camRotate(mapping.dir);
            }
          }, 100);
        }
      }
    });

    document.addEventListener('keyup', (e) => {
      const mapping = keyMap[e.key];
      if (mapping) {
        const key = e.key.toLowerCase();
        activeKeys.delete(key);

        // interval 정리
        if (keyIntervals[key]) {
          clearInterval(keyIntervals[key]);
          delete keyIntervals[key];
        }

        // 버튼 활성화 해제
        const btn = document.getElementById(mapping.btn);
        if (btn) btn.classList.remove('active-key');
      }
    });

    // 씬 탭 업데이트 (Ruby에서 호출)
    function onScenesUpdate(scenesJson) {
      const scenes = JSON.parse(scenesJson);
      const tabsContainer = document.getElementById('scene-tabs');

      // 탭 초기화
      tabsContainer.innerHTML = '';

      // 씬 탭 추가
      scenes.forEach((scene, index) => {
        const tab = document.createElement('div');
        tab.className = 'scene-tab';
        if (scene.active || (!scenes.some(s => s.active) && index === 0)) {
          tab.classList.add('active');
          // 첫 씬을 현재 씬으로 설정 (초기화 시)
          if (!state.currentScene) {
            state.currentScene = scene.name;
          }
        }
        tab.dataset.scene = scene.name;

        // 렌더링 중인 씬이면 스피너 추가
        if (renderingScenes.has(scene.name)) {
          tab.classList.add('rendering');
          const spinner = document.createElement('div');
          spinner.className = 'scene-tab-spinner';
          tab.appendChild(spinner);
        }

        // 씬 이름 텍스트
        const nameSpan = document.createElement('span');
        nameSpan.textContent = scene.name;
        tab.appendChild(nameSpan);

        tab.addEventListener('click', () => {
          // 이미 활성 탭이면 무시
          if (tab.classList.contains('active')) return;

          console.log('[NanoBanana] Scene tab clicked:', scene.name);

          // 현재 씬 상태 저장 & 새 씬 상태 복원
          window.onSceneChanged(scene.name);

          // 활성 탭 변경
          document.querySelectorAll('.scene-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          el.loadingSource.classList.remove('hidden');
          setStatus('Loading scene: ' + scene.name);

          // Ruby에 씬 전환 요청
          sketchup.selectScene(scene.name);
        });
        tabsContainer.appendChild(tab);
      });

      // + 버튼 다시 추가
      const addBtn = document.createElement('button');
      addBtn.className = 'scene-add-btn';
      addBtn.id = 'btn-add-scene';
      addBtn.title = '현재 뷰를 씬으로 저장';
      addBtn.textContent = '+';
      addBtn.addEventListener('click', () => sketchup.addScene());
      tabsContainer.appendChild(addBtn);
    }

    // ========================================
    // 그리드 가이드 시스템
    // ========================================

    // 그리드 그리기 함수
    function drawGrid(canvas, gridSize) {
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // 중앙 좌표
      const centerX = w / 2;
      const centerY = h / 2;

      // 일반 그리드 라인 (연한 색)
      ctx.strokeStyle = 'rgba(255, 100, 100, 0.25)';
      ctx.lineWidth = 1;

      // 수직선 (중앙에서 양쪽으로)
      for (let x = centerX % gridSize; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      // 수평선 (중앙에서 양쪽으로)
      for (let y = centerY % gridSize; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // 중앙 십자 라인 (진한 색)
      ctx.strokeStyle = 'rgba(255, 100, 100, 0.8)';
      ctx.lineWidth = 2;

      // 중앙 수평선
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(w, centerY);
      ctx.stroke();

      // 중앙 수직선
      ctx.beginPath();
      ctx.moveTo(centerX, 0);
      ctx.lineTo(centerX, h);
      ctx.stroke();

      // 중앙 십자 표시
      ctx.fillStyle = 'rgba(255, 100, 100, 0.9)';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+', centerX, centerY);
    }

    // 그리드 캔버스 업데이트 (이미지 크기에 맞춤)
    function updateGridCanvas(canvas, img, slider, valueEl) {
      if (!img || img.style.display === 'none') return;
      canvas.width = img.offsetWidth;
      canvas.height = img.offsetHeight;
      canvas.style.display = 'block';
      const gridSize = parseInt(slider.value);
      valueEl.textContent = gridSize + 'px';
      drawGrid(canvas, gridSize);
    }

    // Source 패널
    const guideControlsSource = document.getElementById('guide-controls-source');
    const canvasSource = document.getElementById('guide-canvas-source');
    const sliderSource = document.getElementById('guide-slider-source');
    const valueSource = document.getElementById('guide-value-source');
    const lockSource = document.getElementById('guide-lock-source');
    const zoomSource = document.getElementById('guide-zoom-source');
    const zoomWrapperSource = document.getElementById('zoom-wrapper-source');
    const btnGuide = document.getElementById('btn-guide');
    let guideActiveSource = false;
    let guideLockedSource = false;

    btnGuide.addEventListener('click', () => {
      guideActiveSource = !guideActiveSource;
      btnGuide.classList.toggle('active', guideActiveSource);
      guideControlsSource.classList.toggle('hidden', !guideActiveSource);
      if (guideActiveSource) {
        updateGridCanvas(canvasSource, el.originalImage, sliderSource, valueSource);
      } else {
        canvasSource.style.display = 'none';
      }
    });

    sliderSource.addEventListener('input', () => {
      updateGridCanvas(canvasSource, el.originalImage, sliderSource, valueSource);
    });

    lockSource.addEventListener('click', () => {
      guideLockedSource = !guideLockedSource;
      lockSource.classList.toggle('locked', guideLockedSource);
      guideControlsSource.classList.toggle('locked', guideLockedSource);
    });

    // Zoom 슬라이더 (Source) - 이미지+그리드 함께 줌
    zoomSource.addEventListener('input', () => {
      const scale = parseInt(zoomSource.value) / 100;
      zoomWrapperSource.style.transform = `scale(${scale})`;
    });

    // Result 패널
    const guideControlsResult = document.getElementById('guide-controls-result');
    const canvasResult = document.getElementById('guide-canvas-result');
    const sliderResult = document.getElementById('guide-slider-result');
    const valueResult = document.getElementById('guide-value-result');
    const lockResult = document.getElementById('guide-lock-result');
    const zoomResult = document.getElementById('guide-zoom-result');
    const zoomWrapperResult = document.getElementById('zoom-wrapper-result');
    const btnGuideResult = document.getElementById('btn-guide-result');
    let guideActiveResult = false;
    let guideLockedResult = false;

    btnGuideResult.addEventListener('click', () => {
      guideActiveResult = !guideActiveResult;
      btnGuideResult.classList.toggle('active', guideActiveResult);
      guideControlsResult.classList.toggle('hidden', !guideActiveResult);
      if (guideActiveResult) {
        updateGridCanvas(canvasResult, el.renderImage, sliderResult, valueResult);
      } else {
        canvasResult.style.display = 'none';
      }
    });

    sliderResult.addEventListener('input', () => {
      updateGridCanvas(canvasResult, el.renderImage, sliderResult, valueResult);
    });

    lockResult.addEventListener('click', () => {
      guideLockedResult = !guideLockedResult;
      lockResult.classList.toggle('locked', guideLockedResult);
      guideControlsResult.classList.toggle('locked', guideLockedResult);
    });

    // Zoom 슬라이더 (Result)
    zoomResult.addEventListener('input', () => {
      const scale = parseInt(zoomResult.value) / 100;
      zoomWrapperResult.style.transform = `scale(${scale})`;
    });

    // 창 리사이즈 시 그리드 업데이트
    window.addEventListener('resize', () => {
      if (guideActiveSource) {
        updateGridCanvas(canvasSource, el.originalImage, sliderSource, valueSource);
      }
      if (guideActiveResult) {
        updateGridCanvas(canvasResult, el.renderImage, sliderResult, valueResult);
      }
    });

    // 패널 확장/축소 기능
    const sourcePanel = document.getElementById('source-panel');
    const resultPanel = document.getElementById('result-panel-1');
    const btnExpandSource = document.getElementById('btn-expand-source');
    const btnExpandResult = document.getElementById('btn-expand-result');

    // 확장 아이콘 SVG
    const expandIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="15 3 21 3 21 9"></polyline>
      <polyline points="9 21 3 21 3 15"></polyline>
      <line x1="21" y1="3" x2="14" y2="10"></line>
      <line x1="3" y1="21" x2="10" y2="14"></line>
    </svg>`;

    // 축소 아이콘 SVG (분할 아이콘)
    const collapseIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="4 14 10 14 10 20"></polyline>
      <polyline points="20 10 14 10 14 4"></polyline>
      <line x1="14" y1="10" x2="21" y2="3"></line>
      <line x1="3" y1="21" x2="10" y2="14"></line>
    </svg>`;

    let expandedPanel = null;

    function togglePanelExpand(panel, otherPanel, btn) {
      if (expandedPanel === panel) {
        // 이미 확장된 상태면 축소
        panel.classList.remove('fullscreen');
        otherPanel.classList.remove('hidden');
        btn.innerHTML = expandIcon;
        btn.title = 'Expand';
        // 다른 패널 버튼도 확장 아이콘으로 복구
        const otherBtn = otherPanel.querySelector('.panel-expand-btn');
        otherBtn.innerHTML = expandIcon;
        otherBtn.title = 'Expand';
        expandedPanel = null;
      } else {
        // 확장
        panel.classList.add('fullscreen');
        otherPanel.classList.add('hidden');
        btn.innerHTML = collapseIcon;
        btn.title = 'Split';
        expandedPanel = panel;
      }
    }

    btnExpandSource.addEventListener('click', () => {
      togglePanelExpand(sourcePanel, resultPanel, btnExpandSource);
    });

    btnExpandResult.addEventListener('click', () => {
      togglePanelExpand(resultPanel, sourcePanel, btnExpandResult);
    });

    // 아이콘 메뉴 클릭 이벤트
    document.querySelectorAll('.icon-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        // 활성 상태 변경
        document.querySelectorAll('.icon-menu-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        // 메뉴별 동작
        const menuId = item.id;
        switch(menuId) {
          case 'menu-render':
            // Render 모드로 전환
            switchToRenderMode();
            break;
          case 'menu-camera':
            // Node Editor 모드로 전환
            switchToNodeMode();
            break;
          case 'menu-mix':
            // Mix 모드로 전환 (팝업 대신 인라인)
            switchToMixMode();
            break;
          case 'menu-history':
            // 히스토리 패널
            switchToRenderMode();
            break;
          case 'menu-help':
            // 도움말
            break;
          case 'menu-settings':
            openSettingsPanel();
            break;
        }
      });
    });

    // ========================================
    // 모드 전환 (Render <-> Mix <-> Node)
    // ========================================
    let currentMode = 'render';

    function switchToRenderMode() {
      if (currentMode === 'render') return;
      currentMode = 'render';

      // Render 모드 UI 표시
      document.getElementById('render-sidebar').style.display = 'flex';
      document.getElementById('render-main-area').style.display = 'flex';

      // Mix 모드 UI 숨김
      document.getElementById('mix-mode-panel').classList.remove('active');
      document.getElementById('mix-main-area').classList.remove('active');
      document.getElementById('mix-options-panel').classList.remove('active');

      // Node 모드 UI 숨김 + Enlarge 모드 리셋
      document.getElementById('node-editor-container').classList.remove('active');
      document.getElementById('node-enlarged-preview').classList.remove('active');
      document.getElementById('node-canvas-area').classList.remove('minimized');
      document.querySelector('.node-inspector-preview').classList.remove('minimap-mode');
      document.getElementById('node-enlarge-btn').classList.remove('active');

      setStatus('Render Mode');
    }

    function switchToMixMode() {
      if (currentMode === 'mix') return;
      currentMode = 'mix';

      // Render 모드 UI 숨김
      document.getElementById('render-sidebar').style.display = 'none';
      document.getElementById('render-main-area').style.display = 'none';

      // Node 모드 UI 숨김 + Enlarge 모드 리셋
      document.getElementById('node-editor-container').classList.remove('active');
      document.getElementById('node-enlarged-preview').classList.remove('active');
      document.getElementById('node-canvas-area').classList.remove('minimized');
      document.querySelector('.node-inspector-preview').classList.remove('minimap-mode');
      document.getElementById('node-enlarge-btn').classList.remove('active');

      // Mix 모드 UI 표시
      document.getElementById('mix-mode-panel').classList.add('active');
      document.getElementById('mix-main-area').classList.add('active');
      document.getElementById('mix-options-panel').classList.add('active');

      // Mix 모드 초기화 (캡처된 이미지가 있으면 로드)
      initMixMode();
      setMixStatus('Mix Mode - ' + mixState.mode);
    }

    function switchToNodeMode() {
      if (currentMode === 'node') return;
      currentMode = 'node';

      // Render 모드 UI 숨김
      document.getElementById('render-sidebar').style.display = 'none';
      document.getElementById('render-main-area').style.display = 'none';

      // Mix 모드 UI 숨김
      document.getElementById('mix-mode-panel').classList.remove('active');
      document.getElementById('mix-main-area').classList.remove('active');
      document.getElementById('mix-options-panel').classList.remove('active');

      // Node 모드 UI 표시
      document.getElementById('node-editor-container').classList.add('active');

      // 초기 노드 없으면 자동 생성
      if (nodeEditor.nodes.length === 0) {
        nodeEditor.addNode('source', 80, 120);
        nodeEditor.addNode('renderer', 480, 120);
        // 자동 연결
        const srcN = nodeEditor.nodes.find(n => n.type === 'source');
        const renN = nodeEditor.nodes.find(n => n.type === 'renderer');
        if (srcN && renN) {
          nodeEditor.connect(srcN.id, renN.id);
        }
        // 소스 카드를 선택된 상태로 시작
        if (srcN) nodeEditor.selectNode(srcN.id);
        // 높이 캐시 후 연결선 재렌더
        requestAnimationFrame(() => nodeEditor.renderConnections());
      }

      // Source 노드에 이미지 자동 로드
      const sourceNode = nodeEditor.nodes.find(n => n.type === 'source');
      if (sourceNode && !sourceNode.data.image) {
        if (state.originalImage) {
          // Render 모드에서 이미 캡처한 이미지가 있으면 바로 사용
          sourceNode.data.image = state.originalImage;
          sourceNode.dirty = false;
          downscaleThumbnail(state.originalImage, function(thumb) {
            sourceNode.thumbnail = thumb;
            nodeEditor.renderNode(sourceNode);
            requestAnimationFrame(() => nodeEditor.renderConnections());
          });
        } else {
          // SketchUp 캡처 직접 실행
          setTimeout(function() {
            nodeEditor.executeSourceNode(sourceNode);
          }, 300);
        }
      }

      setStatus('Node Editor Mode');
    }

    // WEBrick localhost:9876에서 캡처 이미지를 가져와 소스 노드에 자동 로드
    function autoLoadSourceFromBridge(sourceNode) {
      var attempts = 0;
      var maxAttempts = 5;

      function tryFetch() {
        attempts++;
        fetch('http://localhost:9876/api/data', { signal: AbortSignal.timeout(2000) })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (data && data.source) {
              sourceNode.data.image = data.source;
              sourceNode.dirty = false;
              downscaleThumbnail(data.source, function(thumb) {
                sourceNode.thumbnail = thumb;
                nodeEditor.renderNode(sourceNode);
                nodeEditor.updateInspector();
                requestAnimationFrame(function() { nodeEditor.renderConnections(); });
              });
            } else if (attempts < maxAttempts) {
              // 아직 캡처 안 됐으면 1초 후 재시도
              setTimeout(tryFetch, 1000);
            } else {
              // 최종 fallback: sketchup.captureScene 호출
              nodeEditor.executeSourceNode(sourceNode);
            }
          })
          .catch(function() {
            // 서버 연결 실패 → sketchup.captureScene 콜백 방식으로 fallback
            nodeEditor.executeSourceNode(sourceNode);
          });
      }

      // 캡처 타이머(1초)가 최소 1회 실행될 때까지 대기
      setTimeout(tryFetch, 500);
    }

    // ========================================
    // 2차 생성 - 새 결과 패널 동적 생성
    // ========================================

    // 새 결과 패널 HTML 생성
    function createResultPanelHTML(id) {
      return `
        <div class="image-panel result-panel" id="result-panel-${id}" data-result-index="${id}">
          <div class="panel-label">
            <span>Result ${id}</span>
            <button class="panel-close-btn" id="btn-close-${id}" title="패널 닫기">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <button class="panel-expand-btn" id="btn-expand-result-${id}" title="Expand">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
            </button>
          </div>
          <div class="panel-content">
            <div class="empty-state" id="render-empty-${id}">Ready</div>
            <div class="image-zoom-container" id="zoom-container-result-${id}">
              <div class="image-zoom-wrapper" id="zoom-wrapper-result-${id}">
                <img id="render-image-${id}" style="display:none;">
              </div>
            </div>
            <div class="loading-overlay hidden" id="loading-${id}">
              <div class="loading-spinner"></div>
              <div class="loading-text" id="loading-text-${id}">Generating...</div>
              <div class="loading-subtext">Processing previous result</div>
              <div class="loading-progress"><div class="loading-progress-bar"></div></div>
            </div>
          </div>
        </div>
      `;
    }

    // 새 결과 패널 추가
    function addResultPanel(sourceImage, sourcePanelId) {
      const newId = state.nextResultId;
      state.nextResultId++;
      state.resultPanels.push({ id: newId, image: null, sourceImage: sourceImage, sourcePanelId: sourcePanelId });

      // HTML 삽입
      const container = document.getElementById('image-container');
      const html = createResultPanelHTML(newId);
      container.insertAdjacentHTML('beforeend', html);

      // 새 패널의 이벤트 바인딩
      bindResultPanelEvents(newId);

      return newId;
    }

    // 결과 패널 이벤트 바인딩
    function bindResultPanelEvents(id) {
      // 닫기 버튼
      const closeBtn = document.getElementById(`btn-close-${id}`);
      if (closeBtn) {
        closeBtn.addEventListener('click', () => removeResultPanel(id));
      }

      // 2차 생성 버튼
      const regenBtn = document.getElementById(`btn-regenerate-${id}`);
      if (regenBtn) {
        regenBtn.addEventListener('click', () => startRegenerate(id));
      }
    }

    // 결과 패널 제거
    function removeResultPanel(id) {
      // 첫 번째 결과 패널(Result 1)은 제거 불가
      if (id === 1) return;

      const panel = document.getElementById(`result-panel-${id}`);
      if (panel) {
        panel.remove();
        state.resultPanels = state.resultPanels.filter(p => p.id !== id);
      }
    }

    // 2차 생성 시작
    function startRegenerate(sourcePanelId) {
      // 소스 패널의 이미지 가져오기
      const panelData = state.resultPanels.find(p => p.id === sourcePanelId);
      if (!panelData || !panelData.image) {
        setStatus('소스 이미지가 없습니다');
        return;
      }

      // 새 결과 패널 추가
      const newPanelId = addResultPanel(panelData.image, sourcePanelId);

      // 프롬프트는 SOURCE 패널에서 가져옴
      const prompt = el.promptSource.value || '';

      // 로딩 표시
      const loadingEl = document.getElementById(`loading-${newPanelId}`);
      if (loadingEl) loadingEl.classList.remove('hidden');

      // Ruby에 2차 생성 요청 (이전 결과 이미지를 소스로)
      setStatus(`Result ${newPanelId} 생성중...`);
      sketchup.regenerate(panelData.image, prompt, newPanelId);
    }

    // 2차 생성 완료 콜백 (Ruby에서 호출)
    function onRegenerateComplete(base64, panelId) {
      const panelData = state.resultPanels.find(p => p.id === panelId);
      if (panelData) panelData.image = base64;

      // 이미지 표시
      const imgEl = document.getElementById(`render-image-${panelId}`);
      const emptyEl = document.getElementById(`render-empty-${panelId}`);
      const loadingEl = document.getElementById(`loading-${panelId}`);

      if (imgEl) {
        imgEl.src = 'data:image/png;base64,' + base64;
        imgEl.style.display = 'block';
      }
      if (emptyEl) emptyEl.style.display = 'none';
      if (loadingEl) loadingEl.classList.add('hidden');

      setStatus(`Result ${panelId} 완료`);
    }

    // 2차 생성 에러 콜백 (Ruby에서 호출)
    function onRegenerateError(msg, panelId) {
      const loadingEl = document.getElementById(`loading-${panelId}`);
      if (loadingEl) loadingEl.classList.add('hidden');

      setStatus(`Result ${panelId} 실패: ${msg}`);
    }

    // 커스텀 드롭다운 - 모델 선택
    let currentModelValue = 'gemini-2.5-flash-image';
    const modelDropdown = document.getElementById('model-dropdown');
    const modelDropdownSelected = document.getElementById('model-dropdown-selected');
    const modelDropdownMenu = document.getElementById('model-dropdown-menu');
    const modelSelectedText = document.getElementById('model-selected-text');

    // 드롭다운 토글
    modelDropdownSelected.addEventListener('click', function(e) {
      e.stopPropagation();
      modelDropdown.classList.toggle('open');
    });

    // 아이템 선택
    modelDropdownMenu.querySelectorAll('.dropdown-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        e.stopPropagation();
        const value = this.dataset.value;
        const text = this.childNodes[0].textContent.trim();

        // 이전 선택 해제
        modelDropdownMenu.querySelectorAll('.dropdown-item').forEach(function(i) {
          i.classList.remove('selected');
        });

        // 새 선택
        this.classList.add('selected');
        modelSelectedText.textContent = text;
        currentModelValue = value;

        // 드롭다운 닫기
        modelDropdown.classList.remove('open');

        // Ruby에 저장
        sketchup.saveModel(value);

        // 모델이 속한 엔진으로 자동 전환 (모델-엔진 불일치로 렌더 막히는 문제 방지)
        const modelEngine = this.dataset.engine;
        if (modelEngine) {
          sketchup.setEngine(modelEngine);
          document.querySelectorAll('#engine-group .seg-btn').forEach(function(b) {
            b.classList.toggle('active', b.dataset.engine === modelEngine);
          });
        }
      });
    });

    // 외부 클릭시 드롭다운 닫기
    document.addEventListener('click', function(e) {
      if (!modelDropdown.contains(e.target)) {
        modelDropdown.classList.remove('open');
      }
    });

    // 현재 모델 값 가져오기 함수
    function getSelectedModel() {
      return currentModelValue;
    }

    // Ruby에서 호출되는 콜백 - 모델 로드
    function onModelLoaded(model) {
      if (model) {
        currentModelValue = model;
        // data-value로 직접 찾기 (특수문자 대응)
        const items = modelDropdownMenu.querySelectorAll('.dropdown-item');
        let found = null;
        items.forEach(function(item) {
          if (item.dataset.value === model) {
            found = item;
          }
        });
        if (found) {
          items.forEach(function(i) {
            i.classList.remove('selected');
          });
          found.classList.add('selected');
          modelSelectedText.textContent = found.childNodes[0].textContent.trim();
        }
      }
    }

    // 즉시 초기화 (지연 없이)
    sketchup.checkApiStatus();
    sketchup.getScenes();
    sketchup.loadModel();

    // 로딩 화면 숨기기
    setTimeout(function() {
      const loader = document.getElementById('app-loader');
      if (loader) {
        loader.classList.add('hidden');
        setTimeout(function() {
          loader.style.display = 'none';
        }, 500);
      }
    }, 800);
