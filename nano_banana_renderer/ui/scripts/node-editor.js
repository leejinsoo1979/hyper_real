// NanoBanana Renderer - Node Editor
    // ========================================
    // 썸네일 다운스케일 유틸 — 풀사이즈 base64를 320px 너비로 축소
    // 노드 카드에 풀 해상도 이미지를 넣으면 compositing 시 비치볼 발생
    // ========================================
    var _thumbCanvas = null;
    var _thumbCtx = null;
    function downscaleThumbnail(base64, callback, targetWidth) {
      targetWidth = targetWidth || 320;
      var img = new Image();
      img.onload = function() {
        if (img.width <= targetWidth) { callback(base64); return; }
        if (!_thumbCanvas) { _thumbCanvas = document.createElement('canvas'); _thumbCtx = _thumbCanvas.getContext('2d'); }
        var ratio = targetWidth / img.width;
        _thumbCanvas.width = targetWidth;
        _thumbCanvas.height = Math.round(img.height * ratio);
        _thumbCtx.drawImage(img, 0, 0, _thumbCanvas.width, _thumbCanvas.height);
        var small = _thumbCanvas.toDataURL('image/png').split(',')[1];
        callback(small);
      };
      img.onerror = function() { callback(base64); };
      img.src = 'data:image/png;base64,' + base64;
    }

    // ========================================
    // Node Editor System
    // ========================================
    var nodeEditor = {
      nodes: [],
      connections: [],
      nextNodeId: 1,
      selectedNode: null,
      draggingNode: null,
      dragOffset: { x: 0, y: 0 },
      connecting: null, // 연결 중인 노드 ID
      dirty: false,

      // 확장 레지스트리 (extension에서 새 타입 등록용)
      _icons: {},
      _titles: {},
      _noOutputTypes: {},
      _noInputTypes: {},

      // 캔버스 줌/팬
      _zoom: 1,
      _zoomMin: 0.1,
      _zoomMax: 3,
      _panX: 0,
      _panY: 0,
      _isPanning: false,
      _panStart: { x: 0, y: 0 },

      // 노드 추가
      addNode: function(type, x, y) {
        this.pushUndo();
        const node = {
          id: this.nextNodeId++,
          type: type,
          x: x,
          y: y,
          dirty: true,
          status: 'idle',
          data: this.getDefaultData(type),
          thumbnail: null
        };
        this.nodes.push(node);
        this.renderNode(node);
        this.selectNode(node.id);
        this.markDirty();
        return node;
      },

      // 같은 타입의 노드 중 가장 아래에 있는 노드를 찾아서 그 아래에 배치
      addNodeBelow: function(clickedNode, newType) {
        // ★ 체인 렌더링: 완성된 renderer/modifier에서 renderer 추가 시 오른쪽에 연결
        const isChainRender = newType === 'renderer' &&
          (clickedNode.type === 'renderer' || clickedNode.type === 'modifier') &&
          clickedNode.data && clickedNode.data.image;

        if (isChainRender) {
          const targetX = clickedNode.x + 400;
          const targetY = clickedNode.y;
          const newNode = this.addNode(newType, targetX, targetY);
          this.connect(clickedNode.id, newNode.id);
          return;
        }

        // 같은 타입의 기존 노드들 중 가장 아래(y가 큰) 노드 찾기
        const sameTypeNodes = this.nodes.filter(n => n.type === newType);
        let targetX, targetY;

        if (sameTypeNodes.length > 0) {
          // 같은 타입 중 가장 아래 노드 찾기
          const bottomNode = sameTypeNodes.reduce((a, b) => a.y > b.y ? a : b);
          targetX = bottomNode.x;
          targetY = bottomNode.y + 260; // 카드 높이 + 간격
        } else {
          // 같은 타입이 없으면 클릭한 노드 기준 배치
          if (newType === 'source') {
            const sourceNodes = this.nodes.filter(n => n.type === 'source');
            targetX = sourceNodes.length > 0 ? sourceNodes[0].x : 80;
            targetY = clickedNode.y + 260;
          } else if (newType === 'renderer') {
            const rendererNodes = this.nodes.filter(n => n.type === 'renderer');
            targetX = rendererNodes.length > 0 ? rendererNodes[0].x : 480;
            targetY = clickedNode.y + 260;
          } else {
            const rendererNodes = this.nodes.filter(n => n.type === 'renderer');
            if (rendererNodes.length > 0) {
              const bottomRenderer = rendererNodes.reduce((a, b) => a.y > b.y ? a : b);
              targetX = bottomRenderer.x;
              targetY = bottomRenderer.y + 260;
            } else {
              targetX = 480;
              targetY = clickedNode.y + 260;
            }
          }
        }

        const newNode = this.addNode(newType, targetX, targetY);

        // 자동 연결: 소스→렌더러, 렌더러→애니메이션
        if (newType === 'renderer') {
          const sourceNodes = this.nodes.filter(n => n.type === 'source');
          if (sourceNodes.length > 0) {
            this.connect(sourceNodes[sourceNodes.length - 1].id, newNode.id);
          }
        } else if (newType === 'animation') {
          const rendererNodes = this.nodes.filter(n => n.type === 'renderer');
          if (rendererNodes.length > 0) {
            this.connect(rendererNodes[rendererNodes.length - 1].id, newNode.id);
          }
        }
      },

      // 기본 데이터
      getDefaultData: function(type) {
        if (type === 'source') {
          return {
            time: 'day',
            light: 'on',
            image: null
          };
        } else if (type === 'renderer') {
          return {
            engine: 'gemini-2.5-flash-image',
            resolution: '2048',
            aspect: 'original',
            presets: [],
            customPrompt: '',
            negativePrompt: ''
          };
        } else if (type === 'animation') {
          return {
            fps: 24,
            duration: 3,
            style: 'smooth',
            prompt: ''
          };
        }
        return {};
      },

      // 노드 렌더링 (positionOnly=true면 위치만 업데이트, innerHTML 재생성 안함)
      renderNode: function(node, positionOnly) {
        const canvas = document.getElementById('node-canvas');
        let el = document.getElementById('node-' + node.id);
        const isNew = !el;

        if (isNew) {
          el = document.createElement('div');
          el.id = 'node-' + node.id;
          el.className = 'node node-' + node.type;
          if (node.dirty) el.classList.add('dirty');
          el.style.willChange = 'transform';
          canvas.appendChild(el);

          // 드래그 이벤트
          el.addEventListener('mousedown', (e) => this.onNodeMouseDown(e, node));
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectNode(node.id);
          });
        }

        // transform으로 위치 지정 (left/top 대신 GPU 가속)
        el.style.transform = `translate3d(${node.x}px, ${node.y}px, 0)`;
        el.classList.toggle('dirty', node.dirty);
        el.classList.toggle('selected', this.selectedNode === node.id);

        // 드래그 중이면 위치만 업데이트하고 끝
        if (positionOnly) return;

        // 내용 변경 필요 여부 체크 (캐시된 상태와 비교)
        var stateExtra = (node.data.engine || '') + (node.data.scale || '') + (node.data.duration || '') + (node.data.presetId || '') + (node.data.presets ? node.data.presets.join(',') : '') + (node.data.customPrompt || '').substring(0, 40);
        const currentState = (node.thumbnail || '') + '|' + node.type + '|' + node.dirty + '|' + stateExtra;
        if (!isNew && el._cachedState === currentState) return;
        el._cachedState = currentState;

        const icons = {
          source: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
          renderer: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.435,3.06H5.565a2.5,2.5,0,0,0-2.5,2.5V18.44a2.507,2.507,0,0,0,2.5,2.5h12.87a2.507,2.507,0,0,0,2.5-2.5V5.56A2.5,2.5,0,0,0,18.435,3.06ZM4.065,5.56a1.5,1.5,0,0,1,1.5-1.5h12.87a1.5,1.5,0,0,1,1.5,1.5v8.66l-3.88-3.88a1.509,1.509,0,0,0-2.12,0l-4.56,4.57a.513.513,0,0,1-.71,0l-.56-.56a1.522,1.522,0,0,0-2.12,0l-1.92,1.92Zm15.87,12.88a1.5,1.5,0,0,1-1.5,1.5H5.565a1.5,1.5,0,0,1-1.5-1.5v-.75L6.7,15.06a.5.5,0,0,1,.35-.14.524.524,0,0,1,.36.14l.55.56a1.509,1.509,0,0,0,2.12,0l4.57-4.57a.5.5,0,0,1,.71,0l4.58,4.58Z"/><path d="M8.062,10.565a2.5,2.5,0,1,1,2.5-2.5A2.5,2.5,0,0,1,8.062,10.565Zm0-4a1.5,1.5,0,1,0,1.5,1.5A1.5,1.5,0,0,0,8.062,6.565Z"/></svg>',
          animation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 9h20M2 15h20M7 4v16M12 4v16M17 4v16"/><path d="M10 11.5l4 2.5-4 2.5z" fill="currentColor" stroke="none"/></svg>'
        };
        const icon = nodeEditor._icons[node.type] || icons[node.type] || icons.renderer;

        var title = '';
        var sublabel = '';
        // 노드 순번 계산: 연결 그래프 깊이(depth) 기반
        var orderNum = 1;
        var depthNode = node;
        var depthLimit = 20;
        while (depthLimit-- > 0) {
          var prevConn = this.connections.find(function(c) { return c.to === depthNode.id; });
          if (!prevConn) break;
          var prevNode = this.nodes.find(function(n) { return n.id === prevConn.from; });
          if (!prevNode) break;
          orderNum++;
          depthNode = prevNode;
        }

        if (node.type === 'source') {
          title = 'Source';
          sublabel = '';
        } else if (node.type === 'renderer') {
          var eng = node.data.engine || 'gemini-2.5-flash-image';
          var modelNames = {
            'gemini-2.0-flash-exp': 'Flash 2.0',
            'gemini-2.5-flash-image': 'Flash 2.5',
            'gemini-3-pro-image': 'Gemini 3 Pro',
            'imagen-4.0-fast-generate-001': 'Imagen 4 Fast',
            'imagen-4.0-generate-001': 'Imagen 4',
            'photorealistic-fx': 'PhotoFX',
            'sdxl-controlnet': 'SDXL ControlNet',
            'flux-canny': 'Flux Canny'
          };
          var modelName = modelNames[eng] || eng;
          title = orderNum + '. Renderer (' + modelName + ')';
          sublabel = 'Create photorealistic image';
        } else if (node.type === 'modifier') {
          title = orderNum + '. Details editor';
          sublabel = 'Refine and edit details';
        } else if (node.type === 'upscale') {
          title = orderNum + '. Upscaler ' + (node.data.scale || 2) + 'x';
          sublabel = 'Enhance resolution';
        } else if (node.type === 'video') {
          var vidEng = node.data.engine === 'seedance' ? 'Seedance' : 'Kling';
          title = orderNum + '. ' + vidEng + ' ' + (node.data.duration || 5) + 's';
          sublabel = 'Generate video from image';
        } else if (node.type === 'compare') {
          title = 'Compare';
          sublabel = 'Side-by-side comparison';
        } else {
          title = nodeEditor._titles[node.type] || node.type;
          sublabel = '';
        }
        const hasImage = !!node.thumbnail;

        // 미니툴바: 이미지 있는 카드만 표시
        const showToolbar = hasImage;
        // 미니툴바 버튼: 노드 타입에 따라 다른 액션 표시
        var extraBtns = '';
        if (hasImage && (node.type === 'renderer' || node.type === 'modifier')) {
          extraBtns += '<button class="node-mini-toolbar-btn" data-add="modifier" title="Add Modifier"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>';
          extraBtns += '<button class="node-mini-toolbar-btn" data-add="upscale" title="Add Upscale"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="15 3 21 3 21 9"/><line x1="21" y1="3" x2="14" y2="10"/></svg></button>';
          extraBtns += '<button class="node-mini-toolbar-btn" data-add="video" title="Add Video"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none"/></svg></button>';
        }
        const miniToolbar = showToolbar ? `
          <div class="node-mini-toolbar">
            <button class="node-mini-toolbar-btn" data-add="source" title="Add Source">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="3" width="14" height="18" rx="2"/><rect x="7" y="6" width="8" height="5" rx="1"/><line x1="7" y1="14" x2="15" y2="14"/><line x1="7" y1="17" x2="12" y2="17"/><circle cx="17" cy="18" r="4.5" fill="#1c2128" stroke="currentColor" stroke-width="1.5"/><line x1="17" y1="16" x2="17" y2="20"/><line x1="15" y1="18" x2="19" y2="18"/></svg>
            </button>
            <button class="node-mini-toolbar-btn" data-add="renderer" title="Add Renderer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="10" r="2"/><path d="M3 17l4.5-4.5a1.5 1.5 0 0 1 2.1 0l3.9 3.9"/><path d="M14 15l1.5-1.5a1.5 1.5 0 0 1 2.1 0L21 17"/><path d="M17 3l2 2.5L17 8" stroke-width="1.5" fill="none"/></svg>
            </button>${extraBtns}
          </div>` : '';

        if (hasImage) {
          const existingImg = el.querySelector('.node-thumbnail img');
          if (existingImg && el._hasImage) {
            existingImg.src = 'data:image/png;base64,' + node.thumbnail;
            return;
          }
          el._hasImage = true;
          el.innerHTML = `${miniToolbar}
            <div class="node-thumbnail" style="border-radius:10px;">
              <img src="data:image/png;base64,${node.thumbnail}">
            </div>
            <div class="node-ports">
              ${(node.type === 'source' || nodeEditor._noInputTypes[node.type]) ? '<div></div>' : '<div class="node-port node-port-input" data-port="input"></div>'}
              ${nodeEditor._noOutputTypes[node.type] ? '' : '<div class="node-port node-port-output" data-port="output"></div>'}
            </div>
            <div class="node-progress"><div class="node-progress-bar"></div></div>
            <div class="node-label-outside">
              <div class="node-title">${title}</div>
              ${sublabel ? '<div class="node-sublabel">' + sublabel + '</div>' : ''}
            </div>
          `;
        } else {
          el._hasImage = false;
          el.innerHTML = `${miniToolbar}
            <div class="node-thumbnail">
              <div class="node-header-icon">${icon}</div>
            </div>
            <div class="node-ports">
              ${(node.type === 'source' || nodeEditor._noInputTypes[node.type]) ? '<div></div>' : '<div class="node-port node-port-input" data-port="input"></div>'}
              ${nodeEditor._noOutputTypes[node.type] ? '' : '<div class="node-port node-port-output" data-port="output"></div>'}
            </div>
            <div class="node-progress"><div class="node-progress-bar"></div></div>
            <div class="node-label-outside">
              <div class="node-title">${title}</div>
              ${sublabel ? '<div class="node-sublabel">' + sublabel + '</div>' : ''}
            </div>
          `;
        }

        // 높이 캐시 갱신 (renderConnections에서 reflow 방지)
        requestAnimationFrame(function() { el._cachedHeight = el.offsetHeight; });

        // 포트 이벤트
        el.querySelectorAll('.node-port').forEach(port => {
          port.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            this.startConnect(node.id, port.dataset.port);
          });
          port.addEventListener('mouseup', (e) => {
            e.stopPropagation();
            this.endConnect(node.id, port.dataset.port);
          });
        });

        // 미니툴바 버튼 이벤트
        el.querySelectorAll('.node-mini-toolbar-btn').forEach(btn => {
          btn.addEventListener('mousedown', (e) => e.stopPropagation());
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const addType = btn.dataset.add;
            this.addNodeBelow(node, addType);
          });
        });

        // 높이 캐시 (즉시 측정 - 연결선 좌표 정확도를 위해)
        el._cachedHeight = el.offsetHeight || 200;
      },

      // 노드 선택 (CSS 클래스만 토글, innerHTML 재생성 안함)
      selectNode: function(nodeId) {
        const prevId = this.selectedNode;
        // 같은 노드 재선택이면 스킵 (불필요한 updateInspector 방지)
        if (prevId === nodeId) return;
        this.selectedNode = nodeId;
        // 이전 선택 해제
        if (prevId) {
          const prevEl = document.getElementById('node-' + prevId);
          if (prevEl) prevEl.classList.remove('selected');
        }
        // 새 선택 적용
        if (nodeId) {
          const newEl = document.getElementById('node-' + nodeId);
          if (newEl) newEl.classList.add('selected');
        }
        this.updateInspector();
      },

      // Inspector 업데이트
      updateInspector: function() {
        const emptyEl = document.getElementById('node-inspector-empty');
        const sourceEl = document.getElementById('inspector-source');
        const rendererEl = document.getElementById('inspector-renderer');
        const previewEl = document.getElementById('node-preview-image');
        const bottomPrompt = document.getElementById('node-prompt-input');
        const bottomNegative = document.getElementById('node-prompt-negative-input');
        const promptTabs = document.querySelectorAll('.node-prompt-tab');
        const autoBtn = document.getElementById('node-prompt-auto-btn');

        emptyEl.classList.add('hidden');
        sourceEl.classList.add('hidden');
        rendererEl.classList.add('hidden');

        if (!this.selectedNode) {
          emptyEl.classList.remove('hidden');
          previewEl.innerHTML = '<span class="node-inspector-preview-empty">No preview</span>';
          bottomPrompt.value = '';
          bottomPrompt.disabled = true;
          bottomPrompt.placeholder = 'Select a Renderer node to enter prompt...';
          bottomNegative.value = '';
          promptTabs.forEach(function(t) { t.disabled = true; t.classList.remove('active'); });
          promptTabs[0].classList.add('active');
          document.querySelectorAll('.node-prompt-content').forEach(function(c) { c.classList.remove('active'); });
          document.querySelector('.node-prompt-content[data-prompt-content="main"]').classList.add('active');
          autoBtn.disabled = true;
          return;
        }

        const node = this.nodes.find(n => n.id === this.selectedNode);
        if (!node) {
          emptyEl.classList.remove('hidden');
          previewEl.innerHTML = '<span class="node-inspector-preview-empty">No preview</span>';
          return;
        }

        // Preview 이미지 업데이트 — 같은 이미지면 DOM 재생성 스킵 (수 MB base64 파싱 방지)
        var _prevKey = node.id + ':' + (node.data.image ? node.data.image.length : 0);
        if (previewEl._imgKey !== _prevKey) {
          previewEl._imgKey = _prevKey;
          if (node.data.image) {
            previewEl.innerHTML = '<img src="data:image/png;base64,' + node.data.image + '" alt="Preview">';
          } else {
            previewEl.innerHTML = '<span class="node-inspector-preview-empty">No preview</span>';
          }
          // Enlarge 모드 활성 시 enlarged 이미지도 동기화
          var enlargedPreview = document.getElementById('node-enlarged-preview');
          if (enlargedPreview && enlargedPreview.classList.contains('active')) {
            _setEnlargedImage(node.data.image ? 'data:image/png;base64,' + node.data.image : null);
          }
        }

        if (node.type === 'source') {
          sourceEl.classList.remove('hidden');
          // Time 버튼 상태
          sourceEl.querySelectorAll('[data-time]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.time === node.data.time);
          });
          // Light 버튼 상태
          sourceEl.querySelectorAll('[data-light]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.light === node.data.light);
          });
          bottomPrompt.value = '';
          bottomPrompt.disabled = true;
          bottomPrompt.placeholder = 'Select a Renderer node to enter prompt...';
          bottomNegative.value = '';
          promptTabs.forEach(function(t) { t.disabled = true; });
          autoBtn.disabled = true;
        } else if (node.type === 'renderer') {
          rendererEl.classList.remove('hidden');
          // 모델 드롭다운 상태 업데이트
          var modelMenu = document.getElementById('node-model-menu');
          var modelSelectedText = document.getElementById('node-model-selected-text');
          if (modelMenu) {
            var currentModel = node.data.engine || 'gemini-2.5-flash-image';
            modelMenu.querySelectorAll('.dropdown-item').forEach(function(item) {
              var isSelected = item.dataset.value === currentModel;
              item.classList.toggle('selected', isSelected);
              if (isSelected && modelSelectedText) {
                modelSelectedText.textContent = item.childNodes[0].textContent.trim();
              }
            });
          }
          // Resolution 버튼 상태
          rendererEl.querySelectorAll('[data-res]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.res === node.data.resolution);
          });
          // Aspect 버튼 상태
          rendererEl.querySelectorAll('[data-aspect]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.aspect === node.data.aspect);
          });
          // Presets 버튼 상태
          rendererEl.querySelectorAll('[data-preset]').forEach(btn => {
            btn.classList.toggle('active', node.data.presets.includes(btn.dataset.preset));
          });
          // Custom prompt - Inspector와 하단 바 동기화
          const customPrompt = node.data.customPrompt || '';
          document.getElementById('node-custom-prompt').value = customPrompt;
          bottomPrompt.value = customPrompt;
          bottomPrompt.disabled = false;
          bottomPrompt.placeholder = 'Enter rendering prompt...';
          // Negative prompt 동기화
          bottomNegative.value = node.data.negativePrompt || '';
          promptTabs.forEach(function(t) { t.disabled = false; });
          autoBtn.disabled = false;
        }
      },

      // 드래그 시작
      _dragEl: null,
      _dragConns: null, // 드래그 중 업데이트할 연결 정보 캐시
      onNodeMouseDown: function(e, node) {
        if (e.target.classList.contains('node-port')) return;
        this.draggingNode = node;
        // 줌 보정된 드래그 오프셋
        var canvasPos = this.screenToCanvas(e.clientX, e.clientY);
        this.dragOffset = {
          x: canvasPos.x - node.x,
          y: canvasPos.y - node.y
        };
        var el = document.getElementById('node-' + node.id);
        if (el) el.classList.add('dragging');
        this._dragEl = el;
        // 드래그 시작 시 관련 연결 정보를 미리 캐시
        var dc = [];
        var nw = 320, nid = node.id;
        for (var i = 0; i < this.connections.length; i++) {
          var c = this.connections[i];
          if (c.from !== nid && c.to !== nid) continue;
          var otherNode = null;
          var otherEl = null;
          var isFrom = c.from === nid;
          if (isFrom) {
            for (var j = 0; j < this.nodes.length; j++) { if (this.nodes[j].id === c.to) { otherNode = this.nodes[j]; break; } }
            otherEl = otherNode ? document.getElementById('node-' + otherNode.id) : null;
          } else {
            for (var j = 0; j < this.nodes.length; j++) { if (this.nodes[j].id === c.from) { otherNode = this.nodes[j]; break; } }
            otherEl = otherNode ? document.getElementById('node-' + otherNode.id) : null;
          }
          dc.push({ idx: i, isFrom: isFrom, otherNode: otherNode, otherH: otherEl ? (otherEl._cachedHeight || 200) : 200 });
        }
        this._dragConns = dc;
        e.preventDefault();
      },

      // 연결 시작
      startConnect: function(nodeId, portType) {
        if (portType === 'output') {
          this.connecting = { fromId: nodeId, fromPort: 'output' };
        }
      },

      // 연결 끝
      endConnect: function(nodeId, portType) {
        if (this.connecting && portType === 'input' && this.connecting.fromId !== nodeId) {
          this.connect(this.connecting.fromId, nodeId);
        }
        this.connecting = null;
      },

      // 연결 생성
      connect: function(fromId, toId) {
        // 중복 체크
        const exists = this.connections.some(c => c.from === fromId && c.to === toId);
        if (exists) return;

        this.pushUndo();

        // 기존 입력 연결 제거 (하나의 입력만 허용)
        this.connections = this.connections.filter(c => c.to !== toId);

        this.connections.push({ from: fromId, to: toId });
        this.renderConnections();
        this.updatePortStates();
        this.markDirty();
      },

      // 포트 연결 상태 CSS 업데이트
      updatePortStates: function() {
        // 모든 포트에서 connected 제거
        document.querySelectorAll('.node-port.connected').forEach(p => p.classList.remove('connected'));
        // 연결된 포트에 connected 추가
        this.connections.forEach(conn => {
          const fromEl = document.getElementById('node-' + conn.from);
          const toEl = document.getElementById('node-' + conn.to);
          if (fromEl) {
            const outPort = fromEl.querySelector('.node-port-output');
            if (outPort) outPort.classList.add('connected');
          }
          if (toEl) {
            const inPort = toEl.querySelector('.node-port-input');
            if (inPort) inPort.classList.add('connected');
          }
        });
      },

      // 연결선 렌더링 (Canvas 기반 - DOM 조작 없음)
      _connCanvas: null,
      _connCtx: null,
      _ensureCanvas: function() {
        if (this._connCtx) return;
        this._connCanvas = document.getElementById('node-connections');
        this._connCtx = this._connCanvas.getContext('2d');
      },
      // 캐시된 area 크기 (reflow 방지)
      _areaW: 0,
      _areaH: 0,
      _areaDirty: true,
      _refreshAreaSize: function() {
        var area = document.getElementById('node-canvas-area');
        this._areaW = area.clientWidth;
        this._areaH = area.clientHeight;
        this._areaDirty = false;
      },

      _resizeCanvas: function() {
        // canvas는 node-canvas 안에 있으므로 노드 범위에 맞게 크기 설정
        var c = this._connCanvas;
        var maxX = 1200, maxY = 800;
        for (var i = 0; i < this.nodes.length; i++) {
          var n = this.nodes[i];
          if (n.x + 400 > maxX) maxX = n.x + 400;
          if (n.y + 300 > maxY) maxY = n.y + 300;
        }
        var tw = Math.ceil(maxX);
        var th = Math.ceil(maxY);
        if (c.width !== tw || c.height !== th) {
          c.width = tw;
          c.height = th;
        }
      },

      // 캔버스 줌/팬 적용
      // DOM 참조 캐시 (매 프레임 getElementById 방지)
      _canvasEl: null,
      _gridEl: null,
      _zoomLabelEl: null,
      _zoomRafId: null,
      _lastCanvasSize: '',
      _applyZoom: function() {
        if (!this._canvasEl) {
          this._canvasEl = document.getElementById('node-canvas');
          this._gridEl = document.querySelector('.node-canvas-grid');
          this._zoomLabelEl = document.getElementById('node-zoom-label');
        }
        var t = 'translate3d(' + (this._panX * this._zoom) + 'px,' + (this._panY * this._zoom) + 'px,0) scale(' + this._zoom + ')';
        this._canvasEl.style.transform = t;
        this._gridEl.style.transform = t;
        if (this._zoomLabelEl) this._zoomLabelEl.textContent = Math.round(this._zoom * 100) + '%';
      },

      setZoom: function(newZoom, pivotX, pivotY) {
        var oldZoom = this._zoom;
        newZoom = Math.max(this._zoomMin, Math.min(this._zoomMax, newZoom));
        if (newZoom === oldZoom) return;
        if (pivotX !== undefined && pivotY !== undefined) {
          // CSS: transform: scale(z) translate(px, py)
          // transform-origin: 0 0
          // 화면좌표 = (월드좌표 + pan) * zoom
          // 월드좌표 = 화면좌표 / zoom - pan
          // 줌 변경 후 같은 월드좌표가 같은 화면좌표에 있으려면:
          // 화면좌표 = (월드좌표 + newPan) * newZoom
          // newPan = 화면좌표 / newZoom - 월드좌표
          var worldX = pivotX / oldZoom - this._panX;
          var worldY = pivotY / oldZoom - this._panY;
          this._panX = pivotX / newZoom - worldX;
          this._panY = pivotY / newZoom - worldY;
        }
        this._zoom = newZoom;
        this._applyZoom();
      },

      resetZoom: function() {
        this._zoom = 1;
        this._panX = 0;
        this._panY = 0;
        this._applyZoom();
      },

      // 화면 좌표 → 캔버스 좌표 변환
      screenToCanvas: function(sx, sy) {
        var area = document.getElementById('node-canvas-area');
        var rect = area.getBoundingClientRect();
        var x = (sx - rect.left) / this._zoom - this._panX;
        var y = (sy - rect.top) / this._zoom - this._panY;
        return { x: x, y: y };
      },
      // 인터랙션 모드 (줌/팬/드래그 중 경량 렌더링)
      _interacting: false,
      _interactTimer: null,
      _setInteracting: function() {
        this._interacting = true;
        if (this._interactTimer) clearTimeout(this._interactTimer);
        var self = this;
        this._interactTimer = setTimeout(function() {
          self._interacting = false;
          self._interactTimer = null;
          self.renderConnections(); // 풀 퀄리티 재렌더
        }, 200);
      },

      // 데이터 흐름 파티클 애니메이션 상태
      _flowAnimFrame: null,
      _flowPhase: 0,

      renderConnections: function() {
        this._ensureCanvas();
        this._resizeCanvas();
        var ctx = this._connCtx;
        var w = this._connCanvas.width;
        var h = this._connCanvas.height;
        ctx.clearRect(0, 0, w, h);

        var nw = 320;
        var isRunning = this.isRunning;
        var fast = this._interacting;
        // canvas가 node-canvas 안에 있으므로 zoom/pan은 CSS transform이 처리

        for (var i = 0; i < this.connections.length; i++) {
          var conn = this.connections[i];
          var fn = null, tn = null;
          for (var j = 0; j < this.nodes.length; j++) {
            if (this.nodes[j].id === conn.from) fn = this.nodes[j];
            if (this.nodes[j].id === conn.to) tn = this.nodes[j];
            if (fn && tn) break;
          }
          if (!fn || !tn) continue;
          var fe = document.getElementById('node-' + fn.id);
          var te = document.getElementById('node-' + tn.id);
          if (!fe || !te) continue;
          var fh = fe._cachedHeight || (fe._cachedHeight = fe.offsetHeight || 200);
          var th = te._cachedHeight || (te._cachedHeight = te.offsetHeight || 200);

          // 노드 월드 좌표 그대로 사용 (CSS transform이 zoom/pan 처리)
          var x1 = fn.x + nw, y1 = fn.y + fh * 0.5;
          var x2 = tn.x, y2 = tn.y + th * 0.5;

          var dist = Math.abs(x2 - x1);
          var dx = Math.max(50, dist * 0.4);
          if (x1 > x2) {
            dx = Math.max(80, dist * 0.5 + 40);
          }

          // 이 연결이 활성(데이터 흐르는 중)인지 확인
          var isActive = !fast && isRunning && (
            fn.status === 'done' && (tn.status === 'running' || tn.status === 'queued') ||
            fn.status === 'running' || tn.status === 'running'
          );

          // 인터랙션 중: 얇은 선만 (glow 생략 → Canvas 2D 드로 콜 절반)
          if (!fast) {
            ctx.strokeStyle = isActive ? 'rgba(0, 212, 170, 0.3)' : 'rgba(0, 212, 170, 0.15)';
            ctx.lineWidth = isActive ? 10 : 8;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2);
            ctx.stroke();
          }
          ctx.strokeStyle = isActive ? '#00e6b8' : '#00d4aa';
          ctx.lineWidth = isActive ? 3 : 2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2);
          ctx.stroke();

          if (isActive) {
            var phase = this._flowPhase;
            var particleCount = 8;
            for (var p = 0; p < particleCount; p++) {
              var t = ((phase + p / particleCount) % 1);
              var u = 1 - t;
              var cx1 = x1 + dx, cy1 = y1;
              var cx2 = x2 - dx, cy2 = y2;
              var ptx = u*u*u*x1 + 3*u*u*t*cx1 + 3*u*t*t*cx2 + t*t*t*x2;
              var pty = u*u*u*y1 + 3*u*u*t*cy1 + 3*u*t*t*cy2 + t*t*t*y2;
              var size = 4 + 3 * Math.sin(t * Math.PI);
              var alpha = 0.6 + 0.4 * Math.sin(t * Math.PI);
              ctx.shadowColor = 'rgba(0, 230, 184, 0.8)';
              ctx.shadowBlur = 8;
              ctx.fillStyle = 'rgba(0, 255, 200, ' + alpha + ')';
              ctx.beginPath();
              ctx.arc(ptx, pty, size, 0, Math.PI * 2);
              ctx.fill();
              ctx.shadowBlur = 0;
            }
          }

          var arrowSize = 7;
          var ax = -1, ay = 0;
          ctx.fillStyle = isActive ? '#00e6b8' : '#00d4aa';
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x2 + ax * arrowSize - ay * arrowSize * 0.6, y2 + ay * arrowSize + ax * arrowSize * 0.6);
          ctx.lineTo(x2 + ax * arrowSize + ay * arrowSize * 0.6, y2 + ay * arrowSize - ax * arrowSize * 0.6);
          ctx.closePath();
          ctx.fill();
        }
      },

      // 데이터 흐름 애니메이션 시작/정지
      startFlowAnimation: function() {
        console.log('[NodeEditor] startFlowAnimation called, existing frame:', this._flowAnimFrame);
        if (this._flowAnimFrame) return;
        var self = this;
        function animate() {
          self._flowPhase = (self._flowPhase + 0.012) % 1;
          self.renderConnections();
          self._flowAnimFrame = requestAnimationFrame(animate);
        }
        self._flowAnimFrame = requestAnimationFrame(animate);
        console.log('[NodeEditor] Flow animation started, frameId:', self._flowAnimFrame);
      },

      stopFlowAnimation: function() {
        console.log('[NodeEditor] stopFlowAnimation called');
        if (this._flowAnimFrame) {
          cancelAnimationFrame(this._flowAnimFrame);
          this._flowAnimFrame = null;
        }
        this._flowPhase = 0;
        this.renderConnections();
      },

      // Dirty 표시
      markDirty: function() {
        this.dirty = true;
        document.getElementById('node-make-btn').disabled = false;
        this.updateCreditsDisplay();
      },

      // 노드 삭제
      deleteNode: function(nodeId) {
        this.pushUndo();
        this.nodes = this.nodes.filter(n => n.id !== nodeId);
        this.connections = this.connections.filter(c => c.from !== nodeId && c.to !== nodeId);
        const el = document.getElementById('node-' + nodeId);
        if (el) el.remove();
        this.renderConnections();
        if (this.selectedNode === nodeId) {
          this.selectedNode = null;
          this.updateInspector();
        }
      },

      // Make 실행 — node-types-ext.js에서 토폴로지 정렬 버전으로 오버라이드됨
      // 이 기본 버전은 Source→Renderer 직접 실행 (fallback)
      execute: async function() {
        console.log('[NodeEditor] Base execute called (should be overridden by node-types-ext.js)');
        if (!this.dirty) return;
        var self = this;

        var makeBtn = document.getElementById('node-make-btn');
        makeBtn.disabled = true;
        // Make 버튼 타이머
        this._startTime = Date.now();
        function _fmt(ms) {
          var s = Math.floor(ms / 1000); var m = Math.floor(s / 60); s = s % 60;
          return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
        }
        makeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;animation:spin 1s linear infinite;"><path d="M12 2a10 10 0 1 0 10 10"/></svg> ' + _fmt(0);
        this._timerInterval = setInterval(function() {
          makeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;animation:spin 1s linear infinite;"><path d="M12 2a10 10 0 1 0 10 10"/></svg> ' + _fmt(Date.now() - self._startTime);
        }, 1000);

        // Source 먼저 실행
        var sourceNodes = this.nodes.filter(function(n) { return n.type === 'source'; });
        for (var i = 0; i < sourceNodes.length; i++) {
          await this.executeSourceNode(sourceNodes[i]);
          sourceNodes[i].dirty = false;
          this.renderNode(sourceNodes[i]);
        }

        // Renderer 병렬 실행
        var rendererNodes = this.nodes.filter(function(n) { return n.type === 'renderer' && n.dirty; });
        var promises = rendererNodes.map(function(n) {
          return self.executeRendererNode(n).then(function() {
            n.dirty = false;
            self.renderNode(n);
          });
        });
        await Promise.all(promises);

        // 완료
        if (this._timerInterval) { clearInterval(this._timerInterval); this._timerInterval = null; }
        var sec = ((Date.now() - this._startTime) / 1000).toFixed(1);
        this.dirty = false;
        makeBtn.disabled = false;
        makeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#00d4aa" stroke-width="2" style="width:14px;height:14px;"><polyline points="20 6 9 17 4 12"/></svg> Done ' + sec + 's';
        setTimeout(function() {
          makeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px;"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> Make';
        }, 3000);
      },

      // Source 노드 실행
      executeSourceNode: async function(node) {
        console.log('[NodeEditor] executeSourceNode called for node:', node.id, 'imageSize:', state.imageSize);
        const self = this;
        return new Promise((resolve) => {
          // 캡처 요청
          window._nodeSourceCallback = (imageBase64) => {
            console.log('[NodeEditor] Source callback received, image length:', imageBase64 ? imageBase64.length : 0);
            node.data.image = imageBase64;
            node.dirty = false;
            downscaleThumbnail(imageBase64, function(thumb) {
              node.thumbnail = thumb;
              self.renderNode(node);
              self.updateInspector();
              requestAnimationFrame(() => self.renderConnections());
            });
            resolve();
          };
          console.log('[NodeEditor] Calling sketchup.captureScene...');
          sketchup.captureScene(state.imageSize);
          // 타임아웃 fallback
          setTimeout(() => {
            if (window._nodeSourceCallback) {
              console.warn('[NodeEditor] Source capture timeout! Resolving without image.');
              window._nodeSourceCallback = null;
              resolve();
            }
          }, 10000);
        });
      },

      // 렌더링 로딩 오버레이 표시
      _showRenderingOverlay: function(node) {
        console.log('[NodeEditor] _showRenderingOverlay called for node:', node.id, node.type);
        var el = document.getElementById('node-' + node.id);
        if (!el) { console.warn('[NodeEditor] No DOM element for node-' + node.id); return; }

        // 소스 이미지를 블러 처리해서 썸네일에 표시
        var inputConn = this.connections.find(function(c) { return c.to === node.id; });
        if (inputConn) {
          var inputNode = this.nodes.find(function(n) { return n.id === inputConn.from; });
          if (inputNode && inputNode.thumbnail) {
            var thumb = el.querySelector('.node-thumbnail');
            if (thumb) {
              thumb.innerHTML = '<img src="data:image/png;base64,' + inputNode.thumbnail + '" style="filter:blur(12px) brightness(0.5);transform:scale(1.1);">';
            }
          }
        }

        // 회전 보더 스피너
        if (!el.querySelector('.node-border-spinner')) {
          var spinner = document.createElement('div');
          spinner.className = 'node-border-spinner';
          spinner.innerHTML = '<div class="node-border-spinner-mask"></div>';
          el.appendChild(spinner);
        }

        // 오버레이
        var overlay = document.createElement('div');
        overlay.className = 'node-running-overlay';
        overlay.innerHTML =
          '<div class="node-shimmer"></div>' +
          '<div class="node-running-content">' +
            '<div class="node-running-ring"><div class="node-running-ring-inner"></div></div>' +
            '<div class="node-running-timer" id="node-timer-' + node.id + '">00:00</div>' +
            '<div class="node-running-label">Rendering...</div>' +
          '</div>';
        var thumbEl = el.querySelector('.node-thumbnail');
        if (thumbEl) {
          thumbEl.style.position = 'relative';
          thumbEl.appendChild(overlay);
        }

        // 상태 클래스
        el.classList.add('status-running', 'processing');

        // 노드별 타이머
        el._nodeTimerStart = Date.now();
        el._nodeTimerInterval = setInterval(function() {
          var timerEl = document.getElementById('node-timer-' + node.id);
          if (!timerEl) return;
          var elapsed = Math.floor((Date.now() - el._nodeTimerStart) / 1000);
          var m = Math.floor(elapsed / 60);
          var s = elapsed % 60;
          timerEl.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
        }, 1000);
      },

      // 렌더링 로딩 오버레이 제거
      _hideRenderingOverlay: function(node) {
        console.log('[NodeEditor] _hideRenderingOverlay called for node:', node.id);
        var el = document.getElementById('node-' + node.id);
        if (!el) return;
        // 모든 오버레이 제거 (중복 생성 대비)
        var overlays = el.querySelectorAll('.node-running-overlay');
        for (var i = 0; i < overlays.length; i++) overlays[i].remove();
        var spinners = el.querySelectorAll('.node-border-spinner');
        for (var i = 0; i < spinners.length; i++) spinners[i].remove();
        el.classList.remove('status-running', 'processing');
        if (el._nodeTimerInterval) {
          clearInterval(el._nodeTimerInterval);
          el._nodeTimerInterval = null;
        }
        el._nodeTimerStart = null;
      },

      // Renderer 노드 실행 (병렬 지원)
      executeRendererNode: async function(node) {
        console.log('[NodeEditor] executeRendererNode called for node:', node.id);
        // 입력 연결 찾기
        const inputConn = this.connections.find(c => c.to === node.id);
        if (!inputConn) { console.warn('[NodeEditor] No input connection for node:', node.id); return Promise.reject(new Error('No input connection')); }

        const sourceNode = this.nodes.find(n => n.id === inputConn.from);
        if (!sourceNode || !sourceNode.data.image) { console.warn('[NodeEditor] No source image for node:', node.id); return Promise.reject(new Error('No source image')); }

        const self = this;
        const renderId = 'node_' + node.id;

        // 로딩 애니메이션 시작 (node-types-ext.js의 _updateNodeStatus에서 이미 오버레이가 있으면 스킵)
        var existingOverlay = document.querySelector('#node-' + node.id + ' .node-running-overlay');
        if (!existingOverlay) {
          console.log('[NodeEditor] Showing rendering overlay for node:', node.id);
          this._showRenderingOverlay(node);
        } else {
          console.log('[NodeEditor] Overlay already exists for node:', node.id, '(from _updateNodeStatus)');
        }

        return new Promise((resolve, reject) => {
          // 노드별 콜백 등록
          window._nodeRendererCallbacks[renderId] = (result) => {
            console.log('[NodeEditor] Render callback fired for:', renderId, 'success:', result.success);
            try {
              // 로딩 애니메이션 종료
              self._hideRenderingOverlay(node);

              if (result.success) {
                node.data.image = result.image;
                downscaleThumbnail(result.image, function(thumb) {
                  node.thumbnail = thumb;
                  self.renderNode(node);
                  if (self.selectedNode === node.id) {
                    self.updateInspector();
                  }
                  requestAnimationFrame(() => self.renderConnections());
                });
                self.saveToHistory({
                  image: result.image,
                  prompt: node.data.customPrompt || '',
                  negativePrompt: node.data.negativePrompt || '',
                  nodeType: 'renderer',
                  source: 'node'
                });
                resolve();
              } else {
                console.error('[Node] Render failed:', renderId, result.error);
                var el = document.getElementById('node-' + node.id);
                if (el) el.classList.add('status-error');
                reject(new Error(result.error || 'Render failed'));
              }
            } catch (err) {
              console.error('[NodeEditor] Callback error:', err);
              reject(err);
            }
          };

          // 프롬프트 조합
          var prompt = self.assemblePrompt(node);
          var negPrompt = self.assembleNegativePrompt(node);

          // 체인 렌더링: 원본 source 노드까지 역추적하여 time/light 가져오기
          var originNode = sourceNode;
          var maxDepth = 20;
          while (originNode && originNode.type !== 'source' && maxDepth-- > 0) {
            var prevConn = self.connections.find(function(c) { return c.to === originNode.id; });
            if (prevConn) {
              originNode = self.nodes.find(function(n) { return n.id === prevConn.from; });
            } else {
              break;
            }
          }
          var timePreset = (originNode && originNode.data && originNode.data.time) || 'day';
          var lightSwitch = (originNode && originNode.data && originNode.data.light) || 'on';

          console.log('[NodeEditor] Callback registered for:', renderId);
          console.log('[NodeEditor] Prompt length:', prompt.length, 'NegPrompt length:', negPrompt.length);
          console.log('[NodeEditor] Source time:', timePreset, 'light:', lightSwitch, '(origin:', originNode ? originNode.type : 'none', ')');

          // 렌더링 요청
          sketchup.startRender(
            timePreset,
            lightSwitch,
            prompt,
            negPrompt,
            renderId,
            node.data.engine || 'main'
          );

          // 타임아웃 fallback (120초)
          setTimeout(() => {
            if (window._nodeRendererCallbacks[renderId]) {
              console.warn('[Node] Render timeout:', renderId);
              delete window._nodeRendererCallbacks[renderId];
              self._hideRenderingOverlay(node);
              var el = document.getElementById('node-' + node.id);
              if (el) el.classList.add('status-error');
              reject(new Error('Render timeout (120s)'));
            }
          }, 120000);
        });
      },

      // ========================================
      // 프롬프트 조립 함수
      // ========================================

      // 프리셋 ID로 프리셋 객체 조회
      getPresetById: function(node) {
        var category = node.type === 'renderer' ? 'render' : node.type;
        var presets = nodePresets[category];
        if (!presets) return null;

        // renderer는 presets 배열(복수), 나머지는 presetId(단수)
        if (node.type === 'renderer' && node.data.presets && node.data.presets.length > 0) {
          var presetId = node.data.presets[0];
          for (var i = 0; i < presets.length; i++) {
            if (presets[i].id === presetId) return presets[i];
          }
        } else if (node.data.presetId) {
          for (var i = 0; i < presets.length; i++) {
            if (presets[i].id === node.data.presetId) return presets[i];
          }
        }
        return null;
      },

      // 프롬프트 조립: 프리셋 + 커스텀 결합
      assemblePrompt: function(node) {
        var preset = this.getPresetById(node);
        var custom = node.data.customPrompt || '';

        if (!preset) {
          return custom || 'Create photorealistic interior render';
        }

        // mergeMode 처리: replace면 프리셋만, append면 프리셋+커스텀
        var mergeMode = preset.mergeMode || 'append';
        if (mergeMode === 'replace' || !custom) {
          return preset.prompt;
        }
        return preset.prompt + '. ' + custom;
      },

      // 시스템 프롬프트 조립 (visualConstraints + forbiddenChanges)
      assembleSystemPrompt: function(node) {
        var preset = this.getPresetById(node);
        if (!preset) return '';
        var parts = [];
        if (preset.visualConstraints) parts.push(preset.visualConstraints);
        if (preset.forbiddenChanges) parts.push(preset.forbiddenChanges);
        return parts.join('\n');
      },

      // 네거티브 프롬프트 조립
      assembleNegativePrompt: function(node) {
        var preset = this.getPresetById(node);
        var customNeg = node.data.negativePrompt || '';
        var presetNeg = preset ? (preset.negative || '') : '';

        if (presetNeg && customNeg) {
          return presetNeg + ', ' + customNeg;
        }
        return presetNeg || customNeg;
      },

      // Topological Sort
      topologicalSort: function() {
        const result = [];
        const visited = new Set();
        const nodeMap = new Map(this.nodes.map(n => [n.id, n]));

        const visit = (nodeId) => {
          if (visited.has(nodeId)) return;
          visited.add(nodeId);

          // 입력 노드들 먼저 방문
          this.connections
            .filter(c => c.to === nodeId)
            .forEach(c => visit(c.from));

          result.push(nodeId);
        };

        this.nodes.forEach(n => visit(n.id));
        return result;
      },

      // ========================================
      // 크레딧 시스템
      // ========================================
      credits: 100,

      _costTable: { source: 0, renderer: 1, modifier: 1, upscale: 2, video: 5, compare: 0 },

      getCostForNode: function(node) {
        if (node.type === 'upscale') return node.data.scale === 4 ? 4 : 2;
        if (node.type === 'video') return node.data.duration >= 10 ? 10 : 5;
        return this._costTable[node.type] || 0;
      },

      estimateCost: function() {
        var total = 0;
        for (var i = 0; i < this.nodes.length; i++) {
          var n = this.nodes[i];
          if (n.dirty && n.status !== 'blocked') {
            total += this.getCostForNode(n);
          }
        }
        return total;
      },

      updateCreditsDisplay: function() {
        var el = document.getElementById('node-credits-display');
        if (!el) return;
        var cost = this.estimateCost();
        el.textContent = 'Credits: ' + this.credits + (cost > 0 ? ' (-' + cost + ')' : '');

        var makeBtn = document.getElementById('node-make-btn');
        if (makeBtn && cost > this.credits) {
          makeBtn.disabled = true;
          el.style.color = '#ff4444';
        } else if (makeBtn && !this.isRunning) {
          makeBtn.disabled = !this.dirty;
          el.style.color = '#7d8590';
        }
      },

      // ========================================
      // 컨텍스트 메뉴
      // ========================================
      _contextMenuEl: null,

      showContextMenu: function(x, y, items) {
        this.hideContextMenu();
        var menu = document.createElement('div');
        menu.className = 'node-context-menu';

        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          if (item.divider) {
            var div = document.createElement('div');
            div.className = 'node-context-menu-divider';
            menu.appendChild(div);
            continue;
          }
          var el = document.createElement('div');
          el.className = 'node-context-menu-item' + (item.danger ? ' danger' : '');
          el.textContent = item.label;
          el.addEventListener('click', (function(action) {
            return function() { nodeEditor.hideContextMenu(); action(); };
          })(item.action));
          menu.appendChild(el);
        }

        // 뷰포트 경계 확인
        document.body.appendChild(menu);
        var rect = menu.getBoundingClientRect();
        if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 4;
        if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4;
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';

        this._contextMenuEl = menu;
      },

      hideContextMenu: function() {
        if (this._contextMenuEl) {
          this._contextMenuEl.remove();
          this._contextMenuEl = null;
        }
      },

      // ========================================
      // 노드 복제
      // ========================================
      duplicateNode: function(nodeId) {
        var orig = this.nodes.find(function(n) { return n.id === nodeId; });
        if (!orig) return null;

        var newData = JSON.parse(JSON.stringify(orig.data));
        // 이미지 데이터는 복제하지 않음
        delete newData.image;

        var newNode = this.addNode(orig.type, orig.x + 40, orig.y + 40);
        newNode.data = newData;
        newNode.dirty = true;
        newNode.thumbnail = null;
        this.renderNode(newNode);
        return newNode;
      },

      // ========================================
      // 노드 자동 정렬
      // ========================================
      rearrangeNodes: function() {
        if (this.nodes.length === 0) return;

        // BFS 레이어 계산
        var inDegree = {};
        var children = {};
        for (var i = 0; i < this.nodes.length; i++) {
          inDegree[this.nodes[i].id] = 0;
          children[this.nodes[i].id] = [];
        }
        for (var i = 0; i < this.connections.length; i++) {
          var c = this.connections[i];
          if (inDegree[c.to] !== undefined) inDegree[c.to]++;
          if (children[c.from]) children[c.from].push(c.to);
        }

        var queue = [];
        for (var id in inDegree) {
          if (inDegree[id] === 0) queue.push(parseInt(id));
        }

        var depth = 0;
        while (queue.length > 0) {
          var nextQueue = [];
          for (var q = 0; q < queue.length; q++) {
            var nid = queue[q];
            var node = this.nodes.find(function(n) { return n.id === nid; });
            if (node) {
              node.x = depth * 400 + 80;
              node.y = q * 260 + 80;
            }
            var kids = children[nid] || [];
            for (var k = 0; k < kids.length; k++) {
              inDegree[kids[k]]--;
              if (inDegree[kids[k]] === 0) nextQueue.push(kids[k]);
            }
          }
          queue = nextQueue;
          depth++;
        }

        // 전체 재렌더
        for (var i = 0; i < this.nodes.length; i++) {
          this.renderNode(this.nodes[i]);
        }
        this.renderConnections();
      },

      // ========================================
      // Undo / Redo
      // ========================================
      _undoStack: [],
      _redoStack: [],
      _maxUndoSize: 50,

      pushUndo: function() {
        var snapshot = this._serializeGraph();
        this._undoStack.push(snapshot);
        if (this._undoStack.length > this._maxUndoSize) {
          this._undoStack.shift();
        }
        // 새 액션 시 redo 스택 초기화
        this._redoStack = [];
      },

      undo: function() {
        if (this._undoStack.length === 0) return;
        var current = this._serializeGraph();
        this._redoStack.push(current);
        var snapshot = this._undoStack.pop();
        this._restoreGraph(snapshot);
      },

      redo: function() {
        if (this._redoStack.length === 0) return;
        var current = this._serializeGraph();
        this._undoStack.push(current);
        var snapshot = this._redoStack.pop();
        this._restoreGraph(snapshot);
      },

      _serializeGraph: function() {
        var nodesData = [];
        for (var i = 0; i < this.nodes.length; i++) {
          var n = this.nodes[i];
          // 이미지/마스크를 제외하고 data를 얕은 복사 (JSON.stringify 수 MB 방지)
          var dataCopy = {};
          for (var key in n.data) {
            if (key !== 'image' && key !== 'mask' && n.data.hasOwnProperty(key)) {
              dataCopy[key] = n.data[key];
            }
          }
          // presets 배열만 깊은 복사
          if (Array.isArray(dataCopy.presets)) {
            dataCopy.presets = dataCopy.presets.slice();
          }
          nodesData.push({
            id: n.id,
            type: n.type,
            x: n.x,
            y: n.y,
            dirty: n.dirty,
            status: n.status || 'idle',
            data: dataCopy,
            hasThumbnail: !!n.thumbnail
          });
        }
        return JSON.stringify({
          nodes: nodesData,
          connections: this.connections.slice(),
          nextNodeId: this.nextNodeId
        });
      },

      _restoreGraph: function(snapshotStr) {
        var snapshot = JSON.parse(snapshotStr);

        // 기존 DOM 제거
        var container = document.getElementById('node-canvas');
        var nodeEls = container.querySelectorAll('.node');
        for (var i = 0; i < nodeEls.length; i++) {
          nodeEls[i].remove();
        }

        // 데이터 복원
        this.connections = snapshot.connections;
        this.nextNodeId = snapshot.nextNodeId;
        this.nodes = [];

        for (var i = 0; i < snapshot.nodes.length; i++) {
          var sn = snapshot.nodes[i];
          var node = {
            id: sn.id,
            type: sn.type,
            x: sn.x,
            y: sn.y,
            dirty: sn.dirty,
            status: sn.status || 'idle',
            data: sn.data,
            thumbnail: null
          };
          this.nodes.push(node);
          this.renderNode(node);
        }

        this.renderConnections();
        this.selectNode(null);
      },

      // ============= History =============
      _history: [],
      _maxHistory: 50,

      saveToHistory: function(snapshot) {
        // snapshot: { image, prompt, negativePrompt, nodeType, timestamp }
        if (!snapshot || !snapshot.image) return;
        snapshot.timestamp = snapshot.timestamp || Date.now();
        snapshot.id = 'hist-' + snapshot.timestamp + '-' + Math.random().toString(36).substr(2, 4);
        this._history.unshift(snapshot);
        if (this._history.length > this._maxHistory) {
          this._history.pop();
        }
        this._persistHistory();
      },

      _persistHistory: function() {
        try {
          // 이미지는 용량이 크므로 최근 50개만, 각 이미지 앞 200자만 저장하지 않고 전체 저장
          var data = this._history.map(function(h) {
            return { image: h.image, prompt: h.prompt || '', negativePrompt: h.negativePrompt || '', nodeType: h.nodeType || '', source: h.source || 'node', timestamp: h.timestamp, id: h.id };
          });
          localStorage.setItem('nb_node_history', JSON.stringify(data));
        } catch (e) {
          console.warn('[NodeEditor] History persist failed:', e.message);
          // localStorage 용량 초과 시 오래된 항목 제거 후 재시도
          if (this._history.length > 10) {
            this._history.length = 10;
            try {
              var data2 = this._history.map(function(h) {
                return { image: h.image, prompt: h.prompt || '', negativePrompt: h.negativePrompt || '', nodeType: h.nodeType || '', source: h.source || 'node', timestamp: h.timestamp, id: h.id };
              });
              localStorage.setItem('nb_node_history', JSON.stringify(data2));
            } catch (e2) { /* give up */ }
          }
        }
      },

      _loadHistory: function() {
        try {
          var raw = localStorage.getItem('nb_node_history');
          if (raw) {
            this._history = JSON.parse(raw);
            console.log('[NodeEditor] History loaded:', this._history.length, 'items');
          }
        } catch (e) {
          console.warn('[NodeEditor] History load failed:', e.message);
        }
      },

      renderHistoryPage: function() {
        var grid = document.getElementById('node-history-grid');
        if (!grid) return;

        if (this._history.length === 0) {
          grid.innerHTML = '<div class="node-history-empty">No history yet. Render some images to see them here.</div>';
          return;
        }

        var html = '';
        for (var i = 0; i < this._history.length; i++) {
          var item = this._history[i];
          var imgSrc = item.image.startsWith('data:') ? item.image : 'data:image/png;base64,' + item.image;
          var date = new Date(item.timestamp);
          var timeStr = date.getHours() + ':' + String(date.getMinutes()).padStart(2, '0');
          var sourceLabel = item.source === 'render' ? 'Render' : 'Node';
          var sourceClass = item.source === 'render' ? 'source-render' : 'source-node';
          html += '<div class="node-history-card" data-hist-idx="' + i + '" data-source="' + (item.source || 'node') + '">' +
            '<div class="node-history-card-img"><img src="' + imgSrc + '" alt="History"></div>' +
            '<div class="node-history-card-info">' +
              '<span class="node-history-card-type ' + sourceClass + '">' + sourceLabel + '</span>' +
              '<span class="node-history-card-time">' + timeStr + '</span>' +
            '</div>' +
            '<div class="node-history-card-overlay">' +
              '<button class="node-history-use-btn" data-hist-idx="' + i + '">Use</button>' +
            '</div>' +
          '</div>';
        }
        grid.innerHTML = html;
      },

      toggleHistoryPage: function() {
        var page = document.getElementById('node-history-page');
        if (!page) return;
        var isVisible = !page.classList.contains('hidden');
        if (isVisible) {
          page.classList.add('hidden');
        } else {
          this.renderHistoryPage();
          page.classList.remove('hidden');
        }
      },

      loadHistoryItem: function(index) {
        var item = this._history[index];
        if (!item) return;

        // History 페이지 닫기
        var page = document.getElementById('node-history-page');
        if (page) page.classList.add('hidden');

        // 기본 렌더 모드에서 만든 이미지 → 기본 렌더 메뉴로 이동
        if (item.source === 'render') {
          var renderBtn = document.getElementById('menu-render');
          if (renderBtn) renderBtn.click();
          // 기본 렌더 모드의 결과 이미지에 표시
          if (window.switchToRenderMode) switchToRenderMode();
          var resultImg = document.getElementById('result-image');
          if (resultImg) {
            var imgSrc = item.image.startsWith('data:') ? item.image : 'data:image/png;base64,' + item.image;
            resultImg.src = imgSrc;
            resultImg.style.display = 'block';
          }
          return;
        }

        // 노드에서 만든 이미지 → 선택된 노드에 적용
        if (this.selectedNode) {
          var node = this.nodes.find(function(n) { return n.id === nodeEditor.selectedNode; });
          if (node) {
            node.data.image = item.image;
            node.dirty = false;
            this.renderNode(node);
            this.updateInspector();
          }
        }
      },

      // ============= Cache Key =============

      // djb2 해시 함수
      _djb2Hash: function(str) {
        var hash = 5381;
        for (var i = 0; i < str.length; i++) {
          hash = ((hash << 5) + hash) + str.charCodeAt(i);
          hash = hash & hash; // 32비트 정수로 유지
        }
        return hash >>> 0; // unsigned
      },

      computeCacheKey: function(node) {
        // type + 정렬된 파라미터 + 입력 해시
        var parts = [node.type];

        // 파라미터 정렬
        var keys = Object.keys(node.data).sort();
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          // image, mask, videoUrl은 제외 (결과 데이터)
          if (k === 'image' || k === 'mask' || k === 'videoUrl') continue;
          var v = node.data[k];
          if (typeof v === 'object') v = JSON.stringify(v);
          parts.push(k + '=' + v);
        }

        // 입력 노드의 캐시 키 포함
        var conn = this.connections.find(function(c) { return c.to === node.id; });
        if (conn) {
          var inputNode = this.nodes.find(function(n) { return n.id === conn.from; });
          if (inputNode && inputNode._cacheKey) {
            parts.push('input=' + inputNode._cacheKey);
          }
        }

        return this._djb2Hash(parts.join('|')).toString(36);
      },

      // 실행 전 캐시 키 비교
      shouldSkipExecution: function(node) {
        var newKey = this.computeCacheKey(node);
        if (node._cacheKey === newKey && node.data.image && !node.dirty) {
          return true; // 캐시 히트, 실행 스킵
        }
        node._cacheKey = newKey;
        return false;
      },

      // ============= Minimap (Inspector 우측 상단) =============
      // 선택된 노드 1개를 미니 카드로 표시 + 좌우 연결 포트

      renderMinimap: function() {
        var container = document.getElementById('node-inspector-minimap');
        if (!container) return;

        // Enlarge 모드가 아니면 숨김
        var inspectorPreview = document.querySelector('.node-inspector-preview');
        if (!inspectorPreview || !inspectorPreview.classList.contains('minimap-mode')) {
          container.innerHTML = '';
          return;
        }

        // 선택된 노드 찾기
        var node = this.selectedNode ? this.nodes.find(function(n) { return n.id === nodeEditor.selectedNode; }) : null;
        if (!node) {
          // 선택 없으면 이미지가 있는 마지막 노드
          for (var i = this.nodes.length - 1; i >= 0; i--) {
            if (this.nodes[i].thumbnail) { node = this.nodes[i]; break; }
          }
        }
        if (!node) {
          container.innerHTML = '';
          return;
        }

        // 연결된 이전/다음 노드 찾기
        var prevConn = this.connections.find(function(c) { return c.to === node.id; });
        var nextConns = this.connections.filter(function(c) { return c.from === node.id; });
        var hasPrev = !!prevConn;
        var hasNext = nextConns.length > 0;

        // 노드 타이틀 계산 (renderNode와 동일 로직)
        var title = node.type;
        var sublabel = '';
        var depthNode = node, orderNum = 1, depthLimit = 20;
        while (depthLimit-- > 0) {
          var pc = this.connections.find(function(c) { return c.to === depthNode.id; });
          if (!pc) break;
          var pn = this.nodes.find(function(n) { return n.id === pc.from; });
          if (!pn) break;
          orderNum++;
          depthNode = pn;
        }
        if (node.type === 'source') {
          title = 'Source';
        } else if (node.type === 'renderer') {
          var eng = node.data.engine || 'gemini-2.5-flash-image';
          var modelNames = { 'gemini-2.0-flash-exp': 'Flash 2.0', 'gemini-2.5-flash-image': 'Flash 2.5' };
          title = orderNum + '. Renderer (' + (modelNames[eng] || eng) + ')';
          sublabel = node.data.customPrompt ? node.data.customPrompt.substring(0, 50) : 'Create photorealistic image';
        } else if (node.type === 'modifier') {
          title = orderNum + '. Details editor';
          sublabel = 'Refine and edit details';
        } else if (node.type === 'upscale') {
          title = orderNum + '. Upscaler ' + (node.data.scale || 2) + 'x';
        } else if (node.type === 'video') {
          title = orderNum + '. Video';
        }

        var self = this;
        var html = '<div class="minimap-card-wrapper">';

        // 왼쪽 포트 (입력)
        html += '<div class="minimap-port minimap-port-left' + (hasPrev ? ' connected' : '') + '">';
        html += '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M10 17l5-5-5-5v10z"/></svg>';
        html += '</div>';

        // 카드 본체
        html += '<div class="minimap-card minimap-selected">';
        if (node.thumbnail) {
          html += '<div class="minimap-card-img"><img src="data:image/png;base64,' + node.thumbnail + '"></div>';
        } else {
          var icon = this._icons[node.type] || '?';
          html += '<div class="minimap-card-img minimap-card-empty">' + icon + '</div>';
        }
        html += '</div>';

        // 오른쪽 포트 (출력)
        if (!this._noOutputTypes[node.type]) {
          html += '<div class="minimap-port minimap-port-right' + (hasNext ? ' connected' : '') + '">';
          html += '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M10 17l5-5-5-5v10z"/></svg>';
          html += '</div>';
        }

        html += '</div>'; // wrapper

        // 타이틀 + 서브라벨
        html += '<div class="minimap-card-label">';
        html += '<div class="minimap-card-title">' + title + '</div>';
        if (sublabel) html += '<div class="minimap-card-sublabel">' + sublabel + '</div>';
        html += '</div>';

        container.innerHTML = html;

        // 좌우 포트 클릭 시 이전/다음 노드로 이동
        var leftPort = container.querySelector('.minimap-port-left');
        var rightPort = container.querySelector('.minimap-port-right');
        if (leftPort && hasPrev) {
          leftPort.style.cursor = 'pointer';
          leftPort.addEventListener('click', function() {
            var prevNode = self.nodes.find(function(n) { return n.id === prevConn.from; });
            if (prevNode) {
              self.selectNode(prevNode.id);
              if (prevNode.thumbnail) {
                _setEnlargedImage('data:image/png;base64,' + prevNode.thumbnail);
              }
              self.renderMinimap();
            }
          });
        }
        if (rightPort && hasNext) {
          rightPort.style.cursor = 'pointer';
          rightPort.addEventListener('click', function() {
            var nextNode = self.nodes.find(function(n) { return n.id === nextConns[0].to; });
            if (nextNode) {
              self.selectNode(nextNode.id);
              if (nextNode.thumbnail) {
                _setEnlargedImage('data:image/png;base64,' + nextNode.thumbnail);
              }
              self.renderMinimap();
            }
          });
        }
      }
    };

    // 히스토리 로드
    nodeEditor._loadHistory();

    // 윈도우 리사이즈 시 캐시 무효화
    window.addEventListener('resize', function() {
      nodeEditor._areaDirty = true;
      nodeEditor._canvasEl = null;
    });

    // Node Editor 이벤트
    document.getElementById('node-canvas-area').addEventListener('click', (e) => {
      if (e.target.id === 'node-canvas-area' || e.target.classList.contains('node-canvas-grid')) {
        nodeEditor.selectNode(null);
      }
    });

    // 드래그 mousemove - RAF + Canvas 직접 그리기
    var _dragRAF = 0;
    var _dragMX = 0, _dragMY = 0;
    document.addEventListener('mousemove', (e) => {
      // 프롬프트 리사이즈 중이면 무시
      if (nodeEditor._isPromptResizing) return;
      // 캔버스 팬 모드
      if (nodeEditor._isPanning) {
        nodeEditor._setInteracting();
        var dx = e.clientX - nodeEditor._panStart.x;
        var dy = e.clientY - nodeEditor._panStart.y;
        nodeEditor._panX = nodeEditor._panStartPanX + dx / nodeEditor._zoom;
        nodeEditor._panY = nodeEditor._panStartPanY + dy / nodeEditor._zoom;
        nodeEditor._applyZoom();
        return;
      }
      if (!nodeEditor.draggingNode) return;
      nodeEditor._setInteracting();
      _dragMX = e.clientX;
      _dragMY = e.clientY;
      if (_dragRAF) return;
      _dragRAF = requestAnimationFrame(function() {
        _dragRAF = 0;
        var dn = nodeEditor.draggingNode;
        if (!dn) return;
        // 줌 보정된 캔버스 좌표
        var cp = nodeEditor.screenToCanvas(_dragMX, _dragMY);
        var nx = cp.x - nodeEditor.dragOffset.x;
        var ny = cp.y - nodeEditor.dragOffset.y;
        dn.x = nx;
        dn.y = ny;
        var del = nodeEditor._dragEl;
        if (del) del.style.transform = 'translate3d(' + nx + 'px,' + ny + 'px,0)';
        nodeEditor.renderConnections();
      });
    });

    document.addEventListener('mouseup', () => {
      if (nodeEditor._isPanning) {
        nodeEditor._isPanning = false;
      }
      try {
        if (nodeEditor.draggingNode) {
          nodeEditor.pushUndo();
          if (nodeEditor._dragEl) nodeEditor._dragEl.classList.remove('dragging');
          nodeEditor.renderConnections();
        }
      } catch (err) {
        console.error('[NodeEditor] mouseup error:', err);
      }
      // 반드시 정리 (에러 발생해도 실행)
      nodeEditor.draggingNode = null;
      nodeEditor._dragEl = null;
      nodeEditor._dragConns = null;
      nodeEditor.connecting = null;
    });

    // 툴바 버튼
    document.getElementById('node-add-source').addEventListener('click', () => {
      nodeEditor.addNode('source', 100 + Math.random() * 100, 100 + Math.random() * 100);
    });

    document.getElementById('node-add-renderer').addEventListener('click', () => {
      nodeEditor.addNode('renderer', 400 + Math.random() * 100, 100 + Math.random() * 100);
    });

    document.getElementById('node-delete').addEventListener('click', () => {
      if (nodeEditor.selectedNode) {
        nodeEditor.deleteNode(nodeEditor.selectedNode);
      }
    });

    document.getElementById('node-make-btn').addEventListener('click', () => {
      nodeEditor.execute();
    });

    // Inspector 이벤트 - Source
    document.getElementById('inspector-source').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-time], [data-light]');
      if (!btn) return;

      const node = nodeEditor.nodes.find(n => n.id === nodeEditor.selectedNode);
      if (!node) return;

      if (btn.dataset.time) {
        node.data.time = btn.dataset.time;
        node.dirty = true;
      }
      if (btn.dataset.light) {
        node.data.light = btn.dataset.light;
        node.dirty = true;
      }

      nodeEditor.markDirty();
      nodeEditor.renderNode(node);
      nodeEditor.updateInspector();
    });

    document.getElementById('node-source-capture').addEventListener('click', () => {
      const node = nodeEditor.nodes.find(n => n.id === nodeEditor.selectedNode);
      if (node && node.type === 'source') {
        nodeEditor.executeSourceNode(node);
      }
    });

    // Inspector 이벤트 - Renderer
    // 노드 모델 드롭다운 토글
    var nodeModelDropdown = document.getElementById('node-model-dropdown');
    if (nodeModelDropdown) {
      var nodeModelSelected = document.getElementById('node-model-selected');
      var nodeModelMenu = document.getElementById('node-model-menu');

      nodeModelSelected.addEventListener('click', function(e) {
        e.stopPropagation();
        nodeModelDropdown.classList.toggle('open');
      });

      nodeModelMenu.addEventListener('click', function(e) {
        var item = e.target.closest('.dropdown-item');
        if (!item) return;
        e.stopPropagation();

        var modelValue = item.dataset.value;
        var modelText = item.childNodes[0].textContent.trim();

        // 선택 상태 업데이트
        nodeModelMenu.querySelectorAll('.dropdown-item').forEach(function(di) {
          di.classList.remove('selected');
        });
        item.classList.add('selected');
        document.getElementById('node-model-selected-text').textContent = modelText;
        nodeModelDropdown.classList.remove('open');

        // 노드 데이터에 모델 저장
        var node = nodeEditor.nodes.find(function(n) { return n.id === nodeEditor.selectedNode; });
        if (node) {
          node.data.engine = modelValue;
          node.dirty = true;
          nodeEditor.markDirty();
          nodeEditor.renderNode(node);
        }
      });

      // 외부 클릭 시 닫기
      document.addEventListener('click', function() {
        nodeModelDropdown.classList.remove('open');
      });
    }

    document.getElementById('inspector-renderer').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-res], [data-aspect], [data-preset]');
      if (!btn) return;

      const node = nodeEditor.nodes.find(n => n.id === nodeEditor.selectedNode);
      if (!node) return;

      if (btn.dataset.res) {
        node.data.resolution = btn.dataset.res;
        node.dirty = true;
      }
      if (btn.dataset.aspect) {
        node.data.aspect = btn.dataset.aspect;
        node.dirty = true;
      }
      if (btn.dataset.preset) {
        var presetId = btn.dataset.preset;
        var idx = node.data.presets.indexOf(presetId);
        if (idx >= 0) {
          node.data.presets.splice(idx, 1);
        } else {
          node.data.presets.push(presetId);
        }
        node.dirty = true;

        // 프리셋 프롬프트를 하단 바에 즉시 반영
        var preset = nodePresets.render.find(function(p) { return p.id === presetId; });
        if (preset && idx < 0) {
          // 새로 선택됨 → 프리셋 프롬프트로 채움
          node.data.customPrompt = preset.prompt;
          node.data.negativePrompt = preset.negative || '';
          document.getElementById('node-prompt-input').value = preset.prompt;
          document.getElementById('node-prompt-negative-input').value = preset.negative || '';
          var inspPrompt = document.getElementById('node-custom-prompt');
          if (inspPrompt) inspPrompt.value = preset.prompt;
        }
      }

      nodeEditor.markDirty();
      nodeEditor.renderNode(node);
      nodeEditor.updateInspector();
    });

    document.getElementById('node-custom-prompt').addEventListener('input', (e) => {
      const node = nodeEditor.nodes.find(n => n.id === nodeEditor.selectedNode);
      if (node && node.type === 'renderer') {
        node.data.customPrompt = e.target.value;
        node.dirty = true;
        nodeEditor.markDirty();
        nodeEditor.renderNode(node);
      }
    });

    // 아코디언 토글 이벤트
    document.querySelectorAll('.node-inspector-accordion-header').forEach(header => {
      header.addEventListener('click', () => {
        header.parentElement.classList.toggle('open');
      });
    });

    // Inspector 탭 이벤트 - 컨텐츠 전환
    document.querySelectorAll('.node-inspector-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        // 탭 활성 상태
        document.querySelectorAll('.node-inspector-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        // 컨텐츠 전환
        document.querySelectorAll('.node-preview-tab-content').forEach(c => c.classList.remove('active'));
        const content = document.querySelector('.node-preview-tab-content[data-content="' + tabName + '"]');
        if (content) content.classList.add('active');
        // Enlarge 모드 활성화 시 동기화
        const enlargedPreview = document.getElementById('node-enlarged-preview');
        if (enlargedPreview.classList.contains('active')) {
          document.querySelectorAll('.node-enlarged-tab').forEach(t => t.classList.remove('active'));
          const matchTab = document.querySelector('.node-enlarged-tab[data-tab="' + tabName + '"]');
          if (matchTab) matchTab.classList.add('active');
        }
      });
    });

    // Enlarge 버튼 토글
    document.getElementById('node-enlarge-btn').addEventListener('click', () => {
      const enlargedPreview = document.getElementById('node-enlarged-preview');
      const canvasArea = document.getElementById('node-canvas-area');
      const inspectorPreview = document.querySelector('.node-inspector-preview');
      const enlargeBtn = document.getElementById('node-enlarge-btn');
      const isActive = enlargedPreview.classList.toggle('active');

      canvasArea.classList.toggle('minimized', isActive);
      inspectorPreview.classList.toggle('minimap-mode', isActive);
      enlargeBtn.classList.toggle('active', isActive);

      if (isActive) {
        // 현재 Inspector 프리뷰 이미지를 enlarged로 복사
        const previewImg = document.querySelector('#node-preview-image img');
        _setEnlargedImage(previewImg ? previewImg.src : null);
        // 현재 Inspector 탭 상태를 enlarged 탭에 동기화
        const activeTab = document.querySelector('.node-inspector-tab.active');
        if (activeTab) {
          document.querySelectorAll('.node-enlarged-tab').forEach(t => t.classList.remove('active'));
          const matchTab = document.querySelector('.node-enlarged-tab[data-tab="' + activeTab.dataset.tab + '"]');
          if (matchTab) matchTab.classList.add('active');
        }
        // 우측 Inspector 상단에 미니맵 표시
        nodeEditor.renderMinimap();
      } else {
        // Enlarge 해제 시 draw overlay 숨기기
        _hideDrawOverlay();
        // 미니맵 제거
        nodeEditor.renderMinimap();
      }
    });

    // Draw overlay — enlarged image 안에 처음부터 고정 배치, show/hide만 전환
    function _showDrawOverlay() {
      var overlay = document.getElementById('node-draw-overlay');
      if (overlay) overlay.classList.remove('hidden');
    }
    function _hideDrawOverlay() {
      var overlay = document.getElementById('node-draw-overlay');
      if (overlay) overlay.classList.add('hidden');
    }
    // Enlarged image 내용 변경 — draw overlay 보존 (innerHTML 사용 금지)
    function _setEnlargedImage(src) {
      var ei = document.getElementById('node-enlarged-image');
      if (!ei) return;
      var existingImg = ei.querySelector(':scope > img');
      var existingEmpty = ei.querySelector(':scope > .node-inspector-preview-empty');
      if (src) {
        if (existingImg) {
          existingImg.src = src;
        } else {
          if (existingEmpty) existingEmpty.remove();
          var img = document.createElement('img');
          img.src = src;
          img.alt = 'Enlarged Preview';
          ei.insertBefore(img, ei.firstChild);
        }
      } else {
        if (existingImg) existingImg.remove();
        if (!existingEmpty) {
          var span = document.createElement('span');
          span.className = 'node-inspector-preview-empty';
          span.textContent = 'No preview';
          ei.insertBefore(span, ei.firstChild);
        }
      }
    }

    // Enlarged 뷰 탭 이벤트
    document.querySelectorAll('.node-enlarged-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        // Enlarged 탭 활성 상태
        document.querySelectorAll('.node-enlarged-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        // Inspector 탭도 동기화
        document.querySelectorAll('.node-inspector-tab').forEach(t => t.classList.remove('active'));
        const matchTab = document.querySelector('.node-inspector-tab[data-tab="' + tabName + '"]');
        if (matchTab) matchTab.classList.add('active');
        // Inspector 컨텐츠도 전환
        document.querySelectorAll('.node-preview-tab-content').forEach(c => c.classList.remove('active'));
        const content = document.querySelector('.node-preview-tab-content[data-content="' + tabName + '"]');
        if (content) content.classList.add('active');

        // Draw 탭: overlay 표시 + 이미지 로드
        console.log('[NodeEditor] Enlarged tab clicked: ' + tabName + ', hasDrawTab=' + !!window.drawTab + ', selectedNode=' + nodeEditor.selectedNode);
        if (tabName === 'draw') {
          _showDrawOverlay();
          var _overlay = document.getElementById('node-draw-overlay');
          var _canvas = document.getElementById('draw-canvas');
          console.log('[NodeEditor] Draw tab: overlay=' + (_overlay ? 'found, hidden=' + _overlay.classList.contains('hidden') : 'NULL') + ', canvas=' + (_canvas ? _canvas.width + 'x' + _canvas.height : 'NULL'));
          if (window.drawTab && nodeEditor.selectedNode) {
            drawTab.loadFromSelectedNode();
          } else {
            console.warn('[NodeEditor] Draw tab: SKIP loadFromSelectedNode - drawTab=' + !!window.drawTab + ' selectedNode=' + nodeEditor.selectedNode);
          }
        } else {
          _hideDrawOverlay();
          if (tabName === 'preview') {
            var previewImg = document.querySelector('#node-preview-image img');
            _setEnlargedImage(previewImg ? previewImg.src : null);
          }
        }
      });
    });

    // 하단 프롬프트 바 입력 연동 (renderer, modifier, upscale, video 모두 지원)
    var _promptNodeTypes = { renderer: true, modifier: true, upscale: true, video: true };
    document.getElementById('node-prompt-input').addEventListener('input', (e) => {
      const node = nodeEditor.nodes.find(n => n.id === nodeEditor.selectedNode);
      if (node && _promptNodeTypes[node.type]) {
        node.data.customPrompt = e.target.value;
        var inspectorPrompt = document.getElementById('node-custom-prompt');
        if (inspectorPrompt) inspectorPrompt.value = e.target.value;
        node.dirty = true;
        nodeEditor.markDirty();
      }
    });

    // Negative 프롬프트 연동
    document.getElementById('node-prompt-negative-input').addEventListener('input', (e) => {
      const node = nodeEditor.nodes.find(n => n.id === nodeEditor.selectedNode);
      if (node && _promptNodeTypes[node.type]) {
        node.data.negativePrompt = e.target.value;
        node.dirty = true;
        nodeEditor.markDirty();
      }
    });

    // 프롬프트 탭 전환
    document.querySelectorAll('.node-prompt-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        if (this.disabled) return;
        var tabName = this.dataset.promptTab;
        document.querySelectorAll('.node-prompt-tab').forEach(function(t) { t.classList.remove('active'); });
        this.classList.add('active');
        document.querySelectorAll('.node-prompt-content').forEach(function(c) { c.classList.remove('active'); });
        var content = document.querySelector('.node-prompt-content[data-prompt-content="' + tabName + '"]');
        if (content) content.classList.add('active');
      });
    });

    // Auto 프롬프트 생성 버튼
    document.getElementById('node-prompt-auto-btn').addEventListener('click', () => {
      const node = nodeEditor.nodes.find(n => n.id === nodeEditor.selectedNode);
      if (!node || !_promptNodeTypes[node.type]) return;

      const inputConn = nodeEditor.connections.find(c => c.to === node.id);
      if (!inputConn) return;
      const sourceNode = nodeEditor.nodes.find(n => n.id === inputConn.from);
      if (!sourceNode) return;

      const style = (node.data.presets && node.data.presets.length > 0)
        ? node.data.presets.join(', ') : '';
      const time = sourceNode.data.time || 'day';
      const light = sourceNode.data.light || 'on';

      // 로딩 표시
      const promptInput = document.getElementById('node-prompt-input');
      const autoBtn = document.getElementById('node-prompt-auto-btn');
      promptInput.value = '';
      promptInput.placeholder = 'Generating prompt...';
      promptInput.disabled = true;
      autoBtn.disabled = true;
      autoBtn.classList.add('loading');

      window._nodeAutoPromptCallback = (prompt) => {
        node.data.customPrompt = prompt;
        promptInput.value = prompt;
        promptInput.placeholder = 'Create photorealistic image';
        promptInput.disabled = false;
        autoBtn.disabled = false;
        autoBtn.classList.remove('loading');
        const inspectorPrompt = document.getElementById('node-custom-prompt');
        if (inspectorPrompt) inspectorPrompt.value = prompt;
        node.dirty = true;
        nodeEditor.markDirty();
        window._nodeAutoPromptCallback = null;
      };

      sketchup.generateAutoPrompt(style, time, light);
    });

    // 키보드 단축키: Escape, Undo, Redo
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        nodeEditor.hideContextMenu();
        const enlargedPreview = document.getElementById('node-enlarged-preview');
        if (enlargedPreview && enlargedPreview.classList.contains('active')) {
          document.getElementById('node-enlarge-btn').click();
        }
      }
      // Ctrl+Z = Undo, Ctrl+Shift+Z = Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        nodeEditor.undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        nodeEditor.redo();
      }
      // Delete 키로 선택 노드 삭제
      if (e.key === 'Delete' || e.key === 'Backspace') {
        var tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        if (nodeEditor.selectedNode) {
          nodeEditor.deleteNode(nodeEditor.selectedNode);
        }
      }
    });

    // 컨텍스트 메뉴: 캔버스 우클릭
    document.getElementById('node-canvas-area').addEventListener('contextmenu', (e) => {
      e.preventDefault();
      var nodeEl = e.target.closest('.node');
      if (nodeEl) {
        // 노드 우클릭
        var nodeId = parseInt(nodeEl.id.replace('node-', ''));
        nodeEditor.selectNode(nodeId);
        var ctxItems = [
          { label: 'Make', action: function() { nodeEditor.execute(); } },
          { label: 'Duplicate', action: function() { nodeEditor.duplicateNode(nodeId); } },
          { label: '---' },
          { label: 'Compare A', action: function() { nodeEditor._compareA = nodeId; } },
          { label: 'Compare B', action: function() { nodeEditor._compareB = nodeId; } },
          { label: '---' },
          { label: 'Delete', danger: true, action: function() { nodeEditor.deleteNode(nodeId); } }
        ];
        nodeEditor.showContextMenu(e.clientX, e.clientY, ctxItems);
      } else {
        // 캔버스 빈 영역 우클릭 — 줌 보정
        var cp = nodeEditor.screenToCanvas(e.clientX, e.clientY);
        var cx = cp.x, cy = cp.y;
        nodeEditor.showContextMenu(e.clientX, e.clientY, [
          { label: 'Add Source', action: function() { nodeEditor.addNode('source', cx, cy); } },
          { label: 'Add Renderer', action: function() { nodeEditor.addNode('renderer', cx, cy); } },
          { label: 'Add Modifier', action: function() { nodeEditor.addNode('modifier', cx, cy); } },
          { label: 'Add Upscale', action: function() { nodeEditor.addNode('upscale', cx, cy); } },
          { label: 'Add Video', action: function() { nodeEditor.addNode('video', cx, cy); } },
          { label: 'Add Compare', action: function() { nodeEditor.addNode('compare', cx, cy); } },
          { label: '---' },
          { label: 'Rearrange Nodes', action: function() { nodeEditor.rearrangeNodes(); } },
          { label: 'Clear All', danger: true, action: function() {
            if (nodeEditor.nodes.length === 0) return;
            nodeEditor.pushUndo();
            nodeEditor.nodes = [];
            nodeEditor.connections = [];
            nodeEditor.selectedNode = null;
            var area = document.getElementById('node-canvas-area');
            area.querySelectorAll('.node').forEach(function(n) { n.remove(); });
            nodeEditor.renderConnections();
            nodeEditor.updateInspector();
          }}
        ]);
      }
    });

    // 클릭으로 컨텍스트 메뉴 닫기
    document.addEventListener('click', () => {
      nodeEditor.hideContextMenu();
    });

    // History 버튼 이벤트
    document.getElementById('menu-history').addEventListener('click', () => {
      // 노드 모드일 때만 History 페이지 토글
      var nodeContainer = document.getElementById('node-editor-container');
      if (nodeContainer && !nodeContainer.classList.contains('hidden')) {
        nodeEditor.toggleHistoryPage();
      }
    });

    // History 닫기 버튼
    var histClose = document.getElementById('node-history-close');
    if (histClose) {
      histClose.addEventListener('click', () => {
        var page = document.getElementById('node-history-page');
        if (page) page.classList.add('hidden');
      });
    }

    // History 카드 Use 버튼
    document.getElementById('node-history-grid').addEventListener('click', (e) => {
      var useBtn = e.target.closest('.node-history-use-btn');
      if (useBtn) {
        var idx = parseInt(useBtn.dataset.histIdx);
        nodeEditor.loadHistoryItem(idx);
      }
    });

    // ==========================================
    // 캔버스 줌 (마우스 휠) & 팬 (스페이스+드래그 or 중간 버튼)
    // ==========================================
    var canvasArea = document.getElementById('node-canvas-area');

    // 마우스 휠 줌 (마우스 포인터 기준 피벗, 부드러운 보간)
    var _zoomTarget = nodeEditor._zoom;
    var _zoomPivotX = 0, _zoomPivotY = 0;
    var _zoomAnimId = 0;

    function _animateZoom() {
      var curr = nodeEditor._zoom;
      var diff = _zoomTarget - curr;
      // 충분히 가까우면 정확히 맞추고 종료
      if (Math.abs(diff) < 0.001) {
        nodeEditor.setZoom(_zoomTarget, _zoomPivotX, _zoomPivotY);
        _zoomAnimId = 0;
        // 인터랙션 종료 → 풀 퀄리티 리렌더
        nodeEditor._interacting = false;
        return;
      }
      var next = curr + diff * 0.3;
      nodeEditor.setZoom(next, _zoomPivotX, _zoomPivotY);
      _zoomAnimId = requestAnimationFrame(_animateZoom);
    }

    canvasArea.addEventListener('wheel', function(e) {
      e.preventDefault();
      nodeEditor._setInteracting();
      var rect = canvasArea.getBoundingClientRect();
      _zoomPivotX = e.clientX - rect.left;
      _zoomPivotY = e.clientY - rect.top;
      // 방향만 판단, 고정 5% 스텝
      var step = e.deltaY > 0 ? 0.95 : (1 / 0.95);
      _zoomTarget = Math.max(nodeEditor._zoomMin, Math.min(nodeEditor._zoomMax, _zoomTarget * step));
      // 애니메이션 시작 (이미 실행 중이면 타겟만 갱신)
      if (!_zoomAnimId) {
        _zoomAnimId = requestAnimationFrame(_animateZoom);
      }
    }, { passive: false });

    // 캔버스 빈 영역 드래그로 팬 (Shift 누른 상태 또는 중간 버튼)
    var _panKeyDown = false;
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Shift' && !_panKeyDown) {
        _panKeyDown = true;
        canvasArea.style.cursor = 'grab';
      }
    });
    document.addEventListener('keyup', function(e) {
      if (e.key === 'Shift') {
        _panKeyDown = false;
        if (!nodeEditor._isPanning) canvasArea.style.cursor = '';
      }
    });

    canvasArea.addEventListener('mousedown', function(e) {
      // Shift+클릭 또는 중간 버튼으로 팬
      if (_panKeyDown || e.button === 1) {
        e.preventDefault();
        nodeEditor._isPanning = true;
        nodeEditor._panStart = { x: e.clientX, y: e.clientY };
        nodeEditor._panStartPanX = nodeEditor._panX;
        nodeEditor._panStartPanY = nodeEditor._panY;
        canvasArea.style.cursor = 'grabbing';
      }
    });

    canvasArea.addEventListener('mouseup', function() {
      if (nodeEditor._isPanning) {
        canvasArea.style.cursor = _panKeyDown ? 'grab' : '';
      }
    });

    // 줌 리셋 버튼 (더블클릭으로 리셋)
    canvasArea.addEventListener('dblclick', function(e) {
      if (e.target.id === 'node-canvas-area' || e.target.classList.contains('node-canvas-grid')) {
        nodeEditor.resetZoom();
      }
    });

    // 프롬프트 바 리사이즈 — 단순하게 textarea 높이만 변경
    var promptHandle = document.getElementById('node-prompt-resize-handle');
    if (promptHandle) {
      var _pr = { active: false, startY: 0, startH: 0, ta: null };

      promptHandle.addEventListener('mousedown', function(e) {
        var ta = document.getElementById('node-prompt-input');
        if (!ta) return;
        _pr.ta = ta;
        _pr.active = true;
        _pr.startY = e.clientY;
        _pr.startH = ta.offsetHeight;
        nodeEditor._isPromptResizing = true;
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
      });

      document.addEventListener('mousemove', function(e) {
        if (!_pr.active) return;
        _pr.ta.style.height = Math.max(80, Math.min(300, _pr.startH + _pr.startY - e.clientY)) + 'px';
      });

      document.addEventListener('mouseup', function() {
        if (!_pr.active) return;
        _pr.active = false;
        _pr.ta = null;
        nodeEditor._isPromptResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      });
    }
