// NanoBanana - Draw Tab (Inpainting: Overlays + Markers + Arrows)
// 렌더 결과 위에 레퍼런스 이미지 붙여넣기, 화살표/마커로 지시, 프롬프트와 함께 API 전송
(function() {
  'use strict';

  var drawTab = {
    canvas: null,
    ctx: null,
    wrapper: null,
    isDrawing: false,
    tool: 'pen',       // pen | eraser | arrow
    color: '#ff0000',
    brushSize: 10,
    bgImage: null,
    _targetNodeId: null,

    // 스트로크 히스토리 (undo 지원)
    _strokes: [],      // [{type:'pen'|'eraser'|'arrow', color, size, points:[{x,y}]}]
    _currentStroke: null,

    // 오버레이 (Ctrl+V 붙여넣기 이미지)
    _overlays: [],     // [{img, x, y, w, h, id}]
    _nextOverlayId: 1,
    _dragOverlay: null, // 드래그 중인 오버레이
    _dragOff: null,
    _resizeOverlay: null,
    _resizeStart: null,
    _selectedOverlay: null,

    init: function() {
      this.canvas = document.getElementById('draw-canvas');
      this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
      this.wrapper = document.getElementById('draw-canvas-wrapper');
      console.log('[DrawTab] init: canvas=' + !!this.canvas + ', ctx=' + !!this.ctx + ', wrapper=' + !!this.wrapper);
      if (!this.canvas || !this.ctx) {
        console.error('[DrawTab] init FAILED: canvas or ctx is null!');
        return;
      }

      var self = this;

      // 마우스 이벤트
      this.canvas.addEventListener('mousedown', function(e) { self._onMouseDown(e); });
      this.canvas.addEventListener('mousemove', function(e) { self._onMouseMove(e); });
      this.canvas.addEventListener('mouseup', function(e) { self._onMouseUp(e); });
      this.canvas.addEventListener('mouseleave', function() { self._onMouseUp(); });

      // 툴바 이벤트
      var toolbar = document.getElementById('draw-toolbar');
      if (toolbar) {
        toolbar.addEventListener('click', function(e) {
          var toolBtn = e.target.closest('.draw-tool-btn');
          if (toolBtn) {
            var tool = toolBtn.dataset.tool;
            if (tool === 'clear') {
              self._strokes = [];
              self._overlays = [];
              self._selectedOverlay = null;
              self._renderAll();
              return;
            }
            if (tool === 'undo') {
              self._undo();
              return;
            }
            if (tool === 'delete-overlay') {
              self._deleteSelectedOverlay();
              return;
            }
            self.setTool(tool);
            toolbar.querySelectorAll('.draw-tool-btn[data-tool="pen"],.draw-tool-btn[data-tool="eraser"],.draw-tool-btn[data-tool="arrow"]').forEach(function(b) {
              b.classList.toggle('active', b.dataset.tool === tool);
            });
          }
          var colorBtn = e.target.closest('.draw-color-btn');
          if (colorBtn) {
            self.setColor(colorBtn.dataset.color);
            toolbar.querySelectorAll('.draw-color-btn').forEach(function(b) {
              b.classList.toggle('active', b.dataset.color === colorBtn.dataset.color);
            });
          }
        });
      }

      // 브러시 크기 슬라이더
      var slider = document.getElementById('draw-brush-size');
      var label = document.getElementById('draw-size-label');
      if (slider) {
        slider.addEventListener('input', function() {
          self.brushSize = parseInt(slider.value);
          if (label) label.textContent = slider.value;
        });
      }

      // Ctrl+V 이미지 붙여넣기 → 오버레이로 추가
      document.addEventListener('paste', function(e) {
        var drawContent = document.querySelector('.node-preview-tab-content[data-content="draw"]');
        if (!drawContent || !drawContent.classList.contains('active')) return;

        var items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (var i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            var blob = items[i].getAsFile();
            var reader = new FileReader();
            reader.onload = function(ev) {
              self._addOverlay(ev.target.result);
            };
            reader.readAsDataURL(blob);
            e.preventDefault();
            break;
          }
        }
      });

      // Delete 키로 선택된 오버레이 삭제
      document.addEventListener('keydown', function(e) {
        var drawContent = document.querySelector('.node-preview-tab-content[data-content="draw"]');
        if (!drawContent || !drawContent.classList.contains('active')) return;

        if ((e.key === 'Delete' || e.key === 'Backspace') && self._selectedOverlay) {
          // 텍스트 입력 중이 아닐 때만
          if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
            self._deleteSelectedOverlay();
            e.preventDefault();
          }
        }
        // Ctrl+Z undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
          if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
            self._undo();
            e.preventDefault();
          }
        }
      });

      // Apply 버튼
      var applyBtn = document.getElementById('draw-apply-btn');
      if (applyBtn) {
        applyBtn.addEventListener('click', function() {
          self._applyInpainting();
        });
      }
    },

    setTool: function(tool) {
      this.tool = tool;
      this._selectedOverlay = null;
      this._renderAll();
      if (this.canvas) {
        if (tool === 'eraser') this.canvas.style.cursor = 'cell';
        else if (tool === 'arrow') this.canvas.style.cursor = 'crosshair';
        else this.canvas.style.cursor = 'crosshair';
      }
    },

    setColor: function(color) {
      this.color = color;
    },

    // 배경 이미지 로드
    loadBackgroundImage: function(dataUrl) {
      var self = this;
      console.log('[DrawTab] loadBackgroundImage: dataUrl length=' + (dataUrl ? dataUrl.length : 0) + ', prefix=' + (dataUrl ? dataUrl.substring(0, 40) : 'null'));
      var img = new Image();
      img.onload = function() {
        console.log('[DrawTab] img.onload: naturalSize=' + img.naturalWidth + 'x' + img.naturalHeight);
        self.bgImage = img;
        self._strokes = [];
        self._overlays = [];
        self._selectedOverlay = null;
        self._resizeCanvas();
        console.log('[DrawTab] after resize: canvas=' + self.canvas.width + 'x' + self.canvas.height + ', wrapper=' + (self.wrapper ? self.wrapper.clientWidth + 'x' + self.wrapper.clientHeight : 'null'));
        self._renderAll();
        console.log('[DrawTab] renderAll done, bgImage=' + !!self.bgImage);
      };
      img.onerror = function(e) {
        console.error('[DrawTab] img.onerror! Failed to load background image', e);
        self._debugText('IMG LOAD ERROR');
      };
      img.src = dataUrl;
    },

    // 선택된 노드의 입력 이미지를 배경으로 로드
    loadFromNode: function(nodeId) {
      this._targetNodeId = nodeId;
      if (!nodeEditor || !nodeEditor.nodes) return;

      var node = nodeEditor.nodes.find(function(n) { return n.id === nodeId; });
      if (!node) return;

      var conn = nodeEditor.connections.find(function(c) { return c.to === nodeId; });
      if (conn) {
        var inputNode = nodeEditor.nodes.find(function(n) { return n.id === conn.from; });
        if (inputNode && inputNode.data && inputNode.data.image) {
          this.loadBackgroundImage(inputNode.data.image);
          return;
        }
      }

      this.bgImage = null;
      this._strokes = [];
      this._overlays = [];
      this._resizeCanvas();
      this._renderAll();
    },

    // 현재 선택된 노드의 이미지를 배경으로 로드
    loadFromSelectedNode: function() {
      var self = this;
      var dbg = '[DrawTab] loadFromSelectedNode: ';

      if (!nodeEditor || !nodeEditor.selectedNode) {
        console.warn(dbg + 'NO selectedNode');
        this._debugText('No selected node');
        return;
      }
      var nodeId = nodeEditor.selectedNode;
      var node = nodeEditor.nodes.find(function(n) { return n.id === nodeId; });
      if (!node) {
        console.warn(dbg + 'node not found for id=' + nodeId);
        this._debugText('Node not found: ' + nodeId);
        return;
      }

      this._targetNodeId = nodeId;
      console.log(dbg + 'node.type=' + node.type + ', hasImage=' + !!(node.data && node.data.image) + ', imgLen=' + (node.data && node.data.image ? node.data.image.length : 0));

      // 선택된 노드의 data.image (렌더링/캡처 완료 시 저장됨)
      if (node.data && node.data.image) {
        console.log(dbg + 'Loading node.data.image (' + node.data.image.length + ' chars)');
        this.loadBackgroundImage('data:image/png;base64,' + node.data.image);
        return;
      }

      // 연결된 입력 노드의 이미지
      var conn = nodeEditor.connections.find(function(c) { return c.to === nodeId; });
      if (conn) {
        var inputNode = nodeEditor.nodes.find(function(n) { return n.id === conn.from; });
        if (inputNode && inputNode.data && inputNode.data.image) {
          console.log(dbg + 'Loading inputNode image (' + inputNode.data.image.length + ' chars)');
          this.loadBackgroundImage('data:image/png;base64,' + inputNode.data.image);
          return;
        }
        console.warn(dbg + 'inputNode has no image, connFrom=' + conn.from);
      } else {
        console.warn(dbg + 'no input connection');
      }

      // 이미지 없음
      console.warn(dbg + 'No image found → empty canvas');
      this._debugText('No image: node=' + node.type + ', id=' + nodeId);
      this.bgImage = null;
      this._strokes = [];
      this._overlays = [];
      this._resizeCanvas();
      this._renderAll();
    },

    // ============================
    // 오버레이 관리
    // ============================
    _addOverlay: function(dataUrl) {
      var self = this;
      var img = new Image();
      img.onload = function() {
        // 캔버스 대비 적절한 크기로 축소 (최대 40%)
        var maxW = self.canvas.width * 0.4;
        var maxH = self.canvas.height * 0.4;
        var w = img.width;
        var h = img.height;
        if (w > maxW) { h = h * maxW / w; w = maxW; }
        if (h > maxH) { w = w * maxH / h; h = maxH; }

        var overlay = {
          img: img,
          x: (self.canvas.width - w) / 2,
          y: (self.canvas.height - h) / 2,
          w: w,
          h: h,
          id: self._nextOverlayId++
        };
        self._overlays.push(overlay);
        self._selectedOverlay = overlay.id;
        self._renderAll();
      };
      img.src = dataUrl;
    },

    _deleteSelectedOverlay: function() {
      if (!this._selectedOverlay) return;
      var id = this._selectedOverlay;
      this._overlays = this._overlays.filter(function(o) { return o.id !== id; });
      this._selectedOverlay = null;
      this._renderAll();
    },

    _hitTestOverlay: function(x, y) {
      // 뒤에서부터 검사 (최상위 먼저)
      for (var i = this._overlays.length - 1; i >= 0; i--) {
        var o = this._overlays[i];
        if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) {
          return o;
        }
      }
      return null;
    },

    _hitTestResizeHandle: function(x, y) {
      if (!this._selectedOverlay) return null;
      var o = null;
      for (var i = 0; i < this._overlays.length; i++) {
        if (this._overlays[i].id === this._selectedOverlay) { o = this._overlays[i]; break; }
      }
      if (!o) return null;
      var hs = 8; // 핸들 사이즈
      // 우하단 리사이즈 핸들
      if (x >= o.x + o.w - hs && x <= o.x + o.w + hs &&
          y >= o.y + o.h - hs && y <= o.y + o.h + hs) {
        return o;
      }
      return null;
    },

    // ============================
    // Undo
    // ============================
    _undo: function() {
      if (this._strokes.length > 0) {
        this._strokes.pop();
        this._renderAll();
      }
    },

    // ============================
    // 마우스 이벤트
    // ============================
    _getPos: function(e) {
      var rect = this.canvas.getBoundingClientRect();
      var scaleX = this.canvas.width / rect.width;
      var scaleY = this.canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    },

    _onMouseDown: function(e) {
      var pos = this._getPos(e);

      // 리사이즈 핸들 체크
      var resizeTarget = this._hitTestResizeHandle(pos.x, pos.y);
      if (resizeTarget) {
        this._resizeOverlay = resizeTarget;
        this._resizeStart = { x: pos.x, y: pos.y, w: resizeTarget.w, h: resizeTarget.h };
        e.preventDefault();
        return;
      }

      // 오버레이 클릭 체크
      var hitOverlay = this._hitTestOverlay(pos.x, pos.y);
      if (hitOverlay) {
        this._selectedOverlay = hitOverlay.id;
        this._dragOverlay = hitOverlay;
        this._dragOff = { x: pos.x - hitOverlay.x, y: pos.y - hitOverlay.y };
        this._renderAll();
        e.preventDefault();
        return;
      }

      // 오버레이 외부 클릭 시 선택 해제
      this._selectedOverlay = null;
      this._dragOverlay = null;

      // 드로잉 시작
      if (this.tool === 'pen' || this.tool === 'eraser' || this.tool === 'arrow') {
        this.isDrawing = true;
        this._currentStroke = {
          type: this.tool,
          color: this.color,
          size: this.brushSize,
          points: [{ x: pos.x, y: pos.y }]
        };
        this._renderAll();
      }
    },

    _onMouseMove: function(e) {
      var pos = this._getPos(e);

      // 오버레이 리사이즈
      if (this._resizeOverlay && this._resizeStart) {
        var dx = pos.x - this._resizeStart.x;
        var dy = pos.y - this._resizeStart.y;
        var aspect = this._resizeStart.w / this._resizeStart.h;
        var newW = Math.max(30, this._resizeStart.w + dx);
        var newH = newW / aspect;
        this._resizeOverlay.w = newW;
        this._resizeOverlay.h = newH;
        this._renderAll();
        return;
      }

      // 오버레이 드래그
      if (this._dragOverlay) {
        this._dragOverlay.x = pos.x - this._dragOff.x;
        this._dragOverlay.y = pos.y - this._dragOff.y;
        this._renderAll();
        return;
      }

      // 드로잉
      if (!this.isDrawing || !this._currentStroke) return;
      this._currentStroke.points.push({ x: pos.x, y: pos.y });
      this._renderAll();
    },

    _onMouseUp: function() {
      // 오버레이 작업 종료
      if (this._resizeOverlay) {
        this._resizeOverlay = null;
        this._resizeStart = null;
        return;
      }
      if (this._dragOverlay) {
        this._dragOverlay = null;
        this._dragOff = null;
        return;
      }

      // 드로잉 종료
      if (!this.isDrawing || !this._currentStroke) return;
      this.isDrawing = false;

      // 최소 2개 포인트가 있어야 스트로크로 저장
      if (this._currentStroke.points.length >= 1) {
        this._strokes.push(this._currentStroke);
      }
      this._currentStroke = null;
      this._renderAll();
    },

    // ============================
    // 렌더링 — 전체 캔버스 다시 그리기
    // ============================
    _renderAll: function() {
      if (!this.ctx) return;
      var ctx = this.ctx;
      var w = this.canvas.width;
      var h = this.canvas.height;

      // 1. 배경
      ctx.clearRect(0, 0, w, h);
      if (this.bgImage) {
        ctx.drawImage(this.bgImage, 0, 0, w, h);
      } else {
        ctx.fillStyle = '#1c2128';
        ctx.fillRect(0, 0, w, h);
      }

      // 2. 오버레이 이미지들
      for (var i = 0; i < this._overlays.length; i++) {
        var o = this._overlays[i];
        ctx.save();
        // 반투명 테두리
        ctx.drawImage(o.img, o.x, o.y, o.w, o.h);
        // 선택된 오버레이 테두리/핸들
        if (o.id === this._selectedOverlay) {
          ctx.strokeStyle = '#58a6ff';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 3]);
          ctx.strokeRect(o.x, o.y, o.w, o.h);
          ctx.setLineDash([]);
          // 리사이즈 핸들 (우하단)
          ctx.fillStyle = '#58a6ff';
          ctx.fillRect(o.x + o.w - 5, o.y + o.h - 5, 10, 10);
        }
        ctx.restore();
      }

      // 3. 저장된 스트로크들
      for (var s = 0; s < this._strokes.length; s++) {
        this._drawStroke(ctx, this._strokes[s]);
      }

      // 4. 현재 그리고 있는 스트로크 (실시간 미리보기)
      if (this._currentStroke && this._currentStroke.points.length > 0) {
        this._drawStroke(ctx, this._currentStroke);
      }
    },

    _drawStroke: function(ctx, stroke) {
      var pts = stroke.points;
      if (pts.length < 1) return;

      ctx.save();

      if (stroke.type === 'eraser') {
        // 지우개: 배경만 복원 (스트로크/오버레이 위에 배경 다시 그림)
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.lineWidth = stroke.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        if (pts.length === 1) ctx.lineTo(pts[0].x + 0.1, pts[0].y + 0.1);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      } else if (stroke.type === 'arrow') {
        // 화살표: 시작점 → 끝점
        var start = pts[0];
        var end = pts[pts.length - 1];
        var dx = end.x - start.x;
        var dy = end.y - start.y;
        var len = Math.sqrt(dx * dx + dy * dy);
        if (len < 3) { ctx.restore(); return; }

        var headLen = Math.min(20, len * 0.3);
        var angle = Math.atan2(dy, dx);

        // 화살표 몸통
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = Math.max(3, stroke.size * 0.6);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();

        // 화살표 머리
        ctx.fillStyle = stroke.color;
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - headLen * Math.cos(angle - 0.4), end.y - headLen * Math.sin(angle - 0.4));
        ctx.lineTo(end.x - headLen * Math.cos(angle + 0.4), end.y - headLen * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fill();
      } else {
        // 펜
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        if (pts.length === 1) ctx.lineTo(pts[0].x + 0.1, pts[0].y + 0.1);
        ctx.stroke();
      }

      ctx.restore();
    },

    // ============================
    // 컴포지트 이미지 내보내기
    // ============================
    exportComposite: function() {
      if (!this.canvas) return null;
      return this.canvas.toDataURL('image/png');
    },

    // ============================
    // Apply — 인페인팅 실행
    // ============================
    _applyInpainting: function() {
      if (!this._targetNodeId || !nodeEditor) return;
      var node = nodeEditor.nodes.find(function(n) { return n.id === drawTab._targetNodeId; });
      if (!node) return;

      // 드로잉이나 오버레이가 없으면 무시
      if (this._strokes.length === 0 && this._overlays.length === 0) {
        return;
      }

      // 컴포지트 이미지 생성
      var compositeDataUrl = this.exportComposite();
      if (!compositeDataUrl) return;

      // base64만 추출
      var compositeBase64 = compositeDataUrl.split(',')[1];

      // 프롬프트 가져오기
      var promptInput = document.getElementById('draw-prompt-input');
      var prompt = promptInput ? promptInput.value.trim() : '';

      // 인페인팅 프롬프트 조합
      var inpaintPrompt = '★★★ INPAINTING REQUEST ★★★\n';
      inpaintPrompt += 'The attached image shows a rendered scene with RED markers/arrows indicating where changes should be made.\n';
      if (this._overlays.length > 0) {
        inpaintPrompt += 'Reference images have been placed on the scene showing what items should be added at those locations.\n';
      }
      inpaintPrompt += 'Follow the visual markers and arrows precisely.\n\n';

      if (prompt) {
        inpaintPrompt += 'User Instructions: ' + prompt + '\n\n';
      }

      inpaintPrompt += 'CRITICAL RULES:\n';
      inpaintPrompt += '- PRESERVE the exact camera angle, perspective, and framing\n';
      inpaintPrompt += '- PRESERVE all existing furniture and elements that are NOT marked\n';
      inpaintPrompt += '- ADD or MODIFY only what is indicated by the markers/arrows\n';
      inpaintPrompt += '- Blend new elements seamlessly with existing lighting and style\n';
      inpaintPrompt += '- Maintain photorealistic quality\n';
      inpaintPrompt += '- Remove the red markers/arrows from the final result\n';

      // Apply 버튼 로딩 상태
      var applyBtn = document.getElementById('draw-apply-btn');
      if (applyBtn) {
        applyBtn.disabled = true;
        applyBtn.textContent = 'Applying...';
        applyBtn.classList.add('loading');
      }

      // node status 업데이트
      node.status = 'running';
      node.dirty = true;
      nodeEditor.renderNode(node);

      // regenerate 콜백 등록
      var renderId = 'inpaint_' + node.id;
      window._nodeRendererCallbacks = window._nodeRendererCallbacks || {};
      window._nodeRendererCallbacks[renderId] = function(result) {
        // 로딩 해제
        if (applyBtn) {
          applyBtn.disabled = false;
          applyBtn.textContent = 'Apply';
          applyBtn.classList.remove('loading');
        }
        node.status = 'idle';

        if (result.success) {
          node.data.image = result.image;
          downscaleThumbnail(result.image, function(thumb) {
            node.thumbnail = thumb;
            nodeEditor.renderNode(node);
            if (nodeEditor.selectedNode === node.id) {
              nodeEditor.updateInspector();
            }
            nodeEditor.renderConnections();
          });
          // 히스토리 저장
          nodeEditor.saveToHistory({
            image: result.image,
            prompt: prompt || 'Inpainting',
            negativePrompt: '',
            nodeType: 'inpaint',
            source: 'node'
          });
        } else {
          node.dirty = true;
          nodeEditor.renderNode(node);
          console.error('[DrawTab] Inpainting failed:', result.error);
        }
        delete window._nodeRendererCallbacks[renderId];
      };

      // Ruby에 regenerate 요청
      try {
        sketchup.regenerate(compositeBase64, inpaintPrompt, renderId);
      } catch (err) {
        console.error('[DrawTab] sketchup.regenerate error:', err);
        if (applyBtn) {
          applyBtn.disabled = false;
          applyBtn.textContent = 'Apply';
          applyBtn.classList.remove('loading');
        }
        node.status = 'idle';
        nodeEditor.renderNode(node);
        delete window._nodeRendererCallbacks[renderId];
      }
    },

    // 마스크 내보내기 (호환용)
    exportMask: function() {
      return this.exportComposite();
    },

    saveMaskToNode: function() {
      // 기존 호환 — 자동 저장 비활성화 (Apply 버튼으로 대체)
    },

    // 캔버스에 디버그 텍스트 표시 (빨간 큰 글씨)
    _debugText: function(msg) {
      if (!this.canvas || !this.ctx) return;
      this._resizeCanvas();
      var ctx = this.ctx;
      ctx.fillStyle = '#1c2128';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(msg, this.canvas.width / 2, this.canvas.height / 2);
      ctx.fillText('canvas: ' + this.canvas.width + 'x' + this.canvas.height, this.canvas.width / 2, this.canvas.height / 2 + 24);
      var overlay = document.getElementById('node-draw-overlay');
      ctx.fillText('overlay hidden: ' + (overlay ? overlay.classList.contains('hidden') : 'null'), this.canvas.width / 2, this.canvas.height / 2 + 48);
    },

    _resizeCanvas: function() {
      if (!this.canvas || !this.wrapper) return;
      // draw overlay가 enlarged image 안에 고정 배치되어 있으므로
      // enlarged image 크기에서 toolbar/bottom bar 높이를 빼서 사용
      var enlarged = document.getElementById('node-enlarged-image');
      var wrapperW = this.wrapper.clientWidth || this.wrapper.offsetWidth;
      var wrapperH = this.wrapper.clientHeight || this.wrapper.offsetHeight;
      // wrapper 크기가 0이면 enlarged image 크기에서 계산
      if ((!wrapperW || !wrapperH) && enlarged) {
        wrapperW = enlarged.clientWidth || enlarged.offsetWidth || 400;
        wrapperH = (enlarged.clientHeight || enlarged.offsetHeight || 380) - 80;
      }
      if (!wrapperW) wrapperW = 400;
      if (!wrapperH) wrapperH = 300;

      if (this.bgImage) {
        var ratio = this.bgImage.width / this.bgImage.height;
        var canvasW = wrapperW;
        var canvasH = canvasW / ratio;
        if (canvasH > wrapperH) {
          canvasH = wrapperH;
          canvasW = canvasH * ratio;
        }
        this.canvas.width = Math.round(canvasW);
        this.canvas.height = Math.round(canvasH);
      } else {
        this.canvas.width = wrapperW;
        this.canvas.height = wrapperH;
      }
    }
  };

  // 전역 등록
  window.drawTab = drawTab;

  // DOM 준비 시 초기화
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { drawTab.init(); });
  } else {
    drawTab.init();
  }
})();
