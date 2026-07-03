// NanoBanana - Extended Inspector UI for new node types
// Handles: modifier, upscale, video, compare inspector panels

(function() {

  // Inspector HTML 생성 함수
  function buildModifierInspector() {
    var presets = nodePresets.modifier;
    var grid = '<div class="prompt-presets-grid">';
    for (var i = 0; i < presets.length; i++) {
      grid += '<button class="prompt-preset-btn" data-ext-preset="' + presets[i].id + '"><span>' + presets[i].name + '</span></button>';
    }
    grid += '</div>';

    return '<div class="node-inspector-accordion open">' +
      '<div class="node-inspector-accordion-header">' +
        '<span class="node-inspector-accordion-title">Modifier Presets</span>' +
        '<div class="node-inspector-accordion-toggle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></div>' +
      '</div>' +
      '<div class="node-inspector-accordion-body">' + grid + '</div>' +
    '</div>';
  }

  function buildUpscaleInspector() {
    return '<div class="node-inspector-accordion open">' +
      '<div class="node-inspector-accordion-header">' +
        '<span class="node-inspector-accordion-title">Upscale Settings</span>' +
        '<div class="node-inspector-accordion-toggle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></div>' +
      '</div>' +
      '<div class="node-inspector-accordion-body">' +
        '<div class="control-section"><span class="section-label">Scale</span>' +
          '<div class="segmented"><button class="seg-btn active" data-upscale-scale="2">2x</button><button class="seg-btn" data-upscale-scale="4">4x</button></div></div>' +
        '<div class="control-section"><span class="section-label">Optimized for</span>' +
          '<div class="segmented"><button class="seg-btn active" data-upscale-opt="standard">Standard</button><button class="seg-btn" data-upscale-opt="detail">Detail</button><button class="seg-btn" data-upscale-opt="smooth">Smooth</button></div></div>' +
        '<div class="control-section"><span class="section-label">Creativity</span>' +
          '<input type="range" class="ext-slider" data-upscale-param="creativity" min="0" max="100" value="50"></div>' +
        '<div class="control-section"><span class="section-label">Detail strength</span>' +
          '<input type="range" class="ext-slider" data-upscale-param="detailStrength" min="0" max="100" value="50"></div>' +
        '<div class="control-section"><span class="section-label">Similarity</span>' +
          '<input type="range" class="ext-slider" data-upscale-param="similarity" min="0" max="100" value="50"></div>' +
        '<div class="control-section"><span class="section-label">Prompt strength</span>' +
          '<input type="range" class="ext-slider" data-upscale-param="promptStrength" min="0" max="100" value="50"></div>' +
      '</div>' +
    '</div>';
  }

  function buildVideoInspector() {
    var presets = nodePresets.video;
    var grid = '<div class="prompt-presets-grid">';
    for (var i = 0; i < presets.length; i++) {
      grid += '<button class="prompt-preset-btn" data-ext-preset="' + presets[i].id + '"><span>' + presets[i].name + '</span></button>';
    }
    grid += '</div>';

    return '<div class="node-inspector-accordion open">' +
      '<div class="node-inspector-accordion-header">' +
        '<span class="node-inspector-accordion-title">Video Settings</span>' +
        '<div class="node-inspector-accordion-toggle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></div>' +
      '</div>' +
      '<div class="node-inspector-accordion-body">' +
        '<div class="control-section"><span class="section-label">Engine</span>' +
          '<div class="segmented"><button class="seg-btn active" data-video-engine="kling">Kling v2.1</button><button class="seg-btn" data-video-engine="seedance">Seedance</button></div></div>' +
        '<div class="control-section"><span class="section-label">Duration</span>' +
          '<div class="segmented"><button class="seg-btn active" data-video-dur="5">5 sec</button><button class="seg-btn" data-video-dur="10">10 sec</button></div></div>' +
      '</div>' +
    '</div>' +
    '<div class="node-inspector-accordion open">' +
      '<div class="node-inspector-accordion-header">' +
        '<span class="node-inspector-accordion-title">Motion Presets</span>' +
        '<div class="node-inspector-accordion-toggle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></div>' +
      '</div>' +
      '<div class="node-inspector-accordion-body">' + grid + '</div>' +
    '</div>';
  }

  function buildCompareInspector() {
    return '<div class="node-inspector-accordion open">' +
      '<div class="node-inspector-accordion-header">' +
        '<span class="node-inspector-accordion-title">Compare Settings</span>' +
        '<div class="node-inspector-accordion-toggle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></div>' +
      '</div>' +
      '<div class="node-inspector-accordion-body">' +
        '<div class="control-section"><span class="section-label">Mode</span>' +
          '<div class="segmented"><button class="seg-btn active" data-compare-mode="slider">Slider</button><button class="seg-btn" data-compare-mode="side_by_side">Side by Side</button></div></div>' +
        '<div class="control-section" style="padding:8px 0;color:#8b949e;font-size:11px;">Right-click nodes and select "Compare A" / "Compare B" to assign images.</div>' +
      '</div>' +
    '</div>';
  }

  // Inspector 컨테이너 삽입 (HTML에 동적 추가)
  var inspectorContent = document.getElementById('node-inspector-content');
  if (inspectorContent) {
    // modifier
    var modDiv = document.createElement('div');
    modDiv.id = 'inspector-modifier';
    modDiv.className = 'hidden';
    modDiv.innerHTML = buildModifierInspector();
    inspectorContent.appendChild(modDiv);

    // upscale
    var upDiv = document.createElement('div');
    upDiv.id = 'inspector-upscale';
    upDiv.className = 'hidden';
    upDiv.innerHTML = buildUpscaleInspector();
    inspectorContent.appendChild(upDiv);

    // video
    var vidDiv = document.createElement('div');
    vidDiv.id = 'inspector-video';
    vidDiv.className = 'hidden';
    vidDiv.innerHTML = buildVideoInspector();
    inspectorContent.appendChild(vidDiv);

    // compare
    var cmpDiv = document.createElement('div');
    cmpDiv.id = 'inspector-compare';
    cmpDiv.className = 'hidden';
    cmpDiv.innerHTML = buildCompareInspector();
    inspectorContent.appendChild(cmpDiv);
  }

  // 상단 툴바에 새 버튼 추가
  var topbar = document.querySelector('.node-canvas-topbar');
  if (topbar) {
    var addBtns = [
      { id: 'node-add-modifier', label: 'Modifier', type: 'modifier' },
      { id: 'node-add-upscale', label: 'Upscale', type: 'upscale' },
      { id: 'node-add-video', label: 'Video', type: 'video' }
    ];
    var fitBtn = document.getElementById('node-fit');
    for (var i = 0; i < addBtns.length; i++) {
      var btn = document.createElement('button');
      btn.className = 'node-canvas-btn';
      btn.id = addBtns[i].id;
      btn.title = 'Add ' + addBtns[i].label;
      btn.textContent = addBtns[i].label;
      btn.dataset.addType = addBtns[i].type;
      topbar.insertBefore(btn, fitBtn);
    }
  }

  // 툴바 버튼 이벤트
  document.querySelectorAll('[data-add-type]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      nodeEditor.addNode(btn.dataset.addType, 300 + Math.random() * 100, 100 + Math.random() * 100);
    });
  });

  // updateInspector 확장
  var origUpdateInspector = nodeEditor.updateInspector;
  nodeEditor.updateInspector = function() {
    // 새 inspector 패널 숨기기
    var extPanels = ['inspector-modifier', 'inspector-upscale', 'inspector-video', 'inspector-compare'];
    extPanels.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });

    var node = nodeEditor.nodes.find(function(n) { return n.id === nodeEditor.selectedNode; });
    if (node && extPanels.indexOf('inspector-' + node.type) >= 0) {
      // 기존 패널 숨기기
      var emptyEl = document.getElementById('node-inspector-empty');
      var sourceEl = document.getElementById('inspector-source');
      var rendererEl = document.getElementById('inspector-renderer');
      emptyEl.classList.add('hidden');
      sourceEl.classList.add('hidden');
      rendererEl.classList.add('hidden');

      // Preview 업데이트 — 같은 이미지면 DOM 재생성 스킵
      var previewEl = document.getElementById('node-preview-image');
      var _prevKey = node.id + ':' + node.type + ':' + (node.data.image ? node.data.image.length : 0) + ':' + (node.data.videoUrl || '');
      if (previewEl._imgKey !== _prevKey) {
        previewEl._imgKey = _prevKey;
        if (node.type === 'video' && node.data.videoUrl) {
          previewEl.innerHTML = '<div class="video-player-container">' +
            '<video class="video-player" controls autoplay loop muted><source src="' + node.data.videoUrl + '" type="video/mp4"></video>' +
            '</div>';
        } else if (node.data.image) {
          var imgSrc = node.data.image.startsWith('data:') ? node.data.image : 'data:image/png;base64,' + node.data.image;
          previewEl.innerHTML = '<img src="' + imgSrc + '" alt="Preview">';
          if (node.type === 'video') {
            previewEl.innerHTML += '<div class="node-video-overlay"><svg viewBox="0 0 24 24" fill="white" style="width:32px;height:32px;"><polygon points="5,3 19,12 5,21"/></svg></div>';
          }
        } else {
          previewEl.innerHTML = '<span class="node-inspector-preview-empty">No preview</span>';
        }
      }

      // 해당 inspector 표시
      var panel = document.getElementById('inspector-' + node.type);
      if (panel) {
        panel.classList.remove('hidden');
        nodeEditor._syncExtInspector(node);
      }

      // 하단 프롬프트 바 동기화
      var bottomPrompt = document.getElementById('node-prompt-input');
      var bottomNegative = document.getElementById('node-prompt-negative-input');
      var promptTabs = document.querySelectorAll('.node-prompt-tab');
      var autoBtn = document.getElementById('node-prompt-auto-btn');

      if (node.type === 'compare') {
        bottomPrompt.value = '';
        bottomPrompt.disabled = true;
        bottomPrompt.placeholder = 'Compare node has no prompt';
        bottomNegative.value = '';
        promptTabs.forEach(function(t) { t.disabled = true; });
        autoBtn.disabled = true;
      } else {
        bottomPrompt.value = node.data.customPrompt || node.data.prompt || '';
        bottomPrompt.disabled = false;
        bottomPrompt.placeholder = 'Enter prompt...';
        bottomNegative.value = node.data.negativePrompt || '';
        promptTabs.forEach(function(t) { t.disabled = false; });
        autoBtn.disabled = false;
      }
    } else {
      origUpdateInspector.apply(nodeEditor, arguments);
    }
  };

  // Inspector 상태 동기화
  nodeEditor._syncExtInspector = function(node) {
    var panel = document.getElementById('inspector-' + node.type);
    if (!panel) return;

    if (node.type === 'upscale') {
      panel.querySelectorAll('[data-upscale-scale]').forEach(function(btn) {
        btn.classList.toggle('active', parseInt(btn.dataset.upscaleScale) === node.data.scale);
      });
      panel.querySelectorAll('[data-upscale-opt]').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.upscaleOpt === node.data.optimizedFor);
      });
      panel.querySelectorAll('.ext-slider').forEach(function(slider) {
        var param = slider.dataset.upscaleParam;
        if (node.data[param] !== undefined) slider.value = node.data[param] * 100;
      });
    } else if (node.type === 'video') {
      panel.querySelectorAll('[data-video-engine]').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.videoEngine === node.data.engine);
      });
      panel.querySelectorAll('[data-video-dur]').forEach(function(btn) {
        btn.classList.toggle('active', parseInt(btn.dataset.videoDur) === node.data.duration);
      });
    } else if (node.type === 'compare') {
      panel.querySelectorAll('[data-compare-mode]').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.compareMode === node.data.mode);
      });
    }
  };

  // Inspector 이벤트 바인딩
  // Modifier presets
  document.getElementById('inspector-modifier').addEventListener('click', function(e) {
    var btn = e.target.closest('[data-ext-preset]');
    if (!btn) return;
    var node = nodeEditor.nodes.find(function(n) { return n.id === nodeEditor.selectedNode; });
    if (!node) return;
    var preset = nodePresets.modifier.find(function(p) { return p.id === btn.dataset.extPreset; });
    if (!preset) return;
    node.data.customPrompt = preset.prompt;
    node.data.presetId = preset.id;
    node.data.negativePrompt = preset.negative;
    node.dirty = true;
    nodeEditor.markDirty();
    document.getElementById('node-prompt-input').value = preset.prompt;
    document.getElementById('node-prompt-negative-input').value = preset.negative;
  });

  // Upscale controls
  document.getElementById('inspector-upscale').addEventListener('click', function(e) {
    var node = nodeEditor.nodes.find(function(n) { return n.id === nodeEditor.selectedNode; });
    if (!node) return;
    var scaleBtn = e.target.closest('[data-upscale-scale]');
    if (scaleBtn) { node.data.scale = parseInt(scaleBtn.dataset.upscaleScale); node.dirty = true; nodeEditor.markDirty(); nodeEditor._syncExtInspector(node); }
    var optBtn = e.target.closest('[data-upscale-opt]');
    if (optBtn) { node.data.optimizedFor = optBtn.dataset.upscaleOpt; node.dirty = true; nodeEditor.markDirty(); nodeEditor._syncExtInspector(node); }
  });

  document.getElementById('inspector-upscale').addEventListener('input', function(e) {
    if (!e.target.classList.contains('ext-slider')) return;
    var node = nodeEditor.nodes.find(function(n) { return n.id === nodeEditor.selectedNode; });
    if (!node) return;
    var param = e.target.dataset.upscaleParam;
    node.data[param] = parseInt(e.target.value) / 100;
    node.dirty = true;
    nodeEditor.markDirty();
  });

  // Video controls
  document.getElementById('inspector-video').addEventListener('click', function(e) {
    var node = nodeEditor.nodes.find(function(n) { return n.id === nodeEditor.selectedNode; });
    if (!node) return;
    var engBtn = e.target.closest('[data-video-engine]');
    if (engBtn) { node.data.engine = engBtn.dataset.videoEngine; node.dirty = true; nodeEditor.markDirty(); nodeEditor._syncExtInspector(node); }
    var durBtn = e.target.closest('[data-video-dur]');
    if (durBtn) { node.data.duration = parseInt(durBtn.dataset.videoDur); node.dirty = true; nodeEditor.markDirty(); nodeEditor._syncExtInspector(node); }
    var presetBtn = e.target.closest('[data-ext-preset]');
    if (presetBtn) {
      var preset = nodePresets.video.find(function(p) { return p.id === presetBtn.dataset.extPreset; });
      if (preset) {
        node.data.customPrompt = preset.prompt;
        node.dirty = true;
        nodeEditor.markDirty();
        document.getElementById('node-prompt-input').value = preset.prompt;
      }
    }
  });

  // Compare controls
  document.getElementById('inspector-compare').addEventListener('click', function(e) {
    var node = nodeEditor.nodes.find(function(n) { return n.id === nodeEditor.selectedNode; });
    if (!node) return;
    var modeBtn = e.target.closest('[data-compare-mode]');
    if (modeBtn) { node.data.mode = modeBtn.dataset.compareMode; nodeEditor._syncExtInspector(node); }
  });

  // 아코디언 토글 (새 패널용)
  document.querySelectorAll('#inspector-modifier .node-inspector-accordion-header, #inspector-upscale .node-inspector-accordion-header, #inspector-video .node-inspector-accordion-header, #inspector-compare .node-inspector-accordion-header').forEach(function(header) {
    header.addEventListener('click', function() {
      header.parentElement.classList.toggle('open');
    });
  });

  // Draw 탭 연동: 탭 전환 시 drawTab에 현재 노드 로드
  document.querySelectorAll('.node-inspector-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      if (tab.dataset.tab === 'draw' && window.drawTab && nodeEditor.selectedNode) {
        drawTab.loadFromSelectedNode();
      }
      if (tab.dataset.tab === 'compare' && nodeEditor.selectedNode) {
        _renderCompareView();
      }
    });
  });

  // ============= Compare Viewer =============

  function _getCompareImages(node) {
    // compare 노드: 연결된 입력 노드 또는 우클릭으로 지정한 Compare A/B 사용
    if (!node) return { a: null, b: null };

    // 우클릭 Compare A/B가 지정되어 있으면 우선
    var imgA = null, imgB = null;
    if (nodeEditor._compareA) {
      var aNode = nodeEditor.nodes.find(function(n) { return n.id === nodeEditor._compareA; });
      if (aNode && aNode.data && aNode.data.image) {
        imgA = aNode.data.image;
        if (!imgA.startsWith('data:')) imgA = 'data:image/png;base64,' + imgA;
      }
    }
    if (nodeEditor._compareB) {
      var bNode = nodeEditor.nodes.find(function(n) { return n.id === nodeEditor._compareB; });
      if (bNode && bNode.data && bNode.data.image) {
        imgB = bNode.data.image;
        if (!imgB.startsWith('data:')) imgB = 'data:image/png;base64,' + imgB;
      }
    }
    if (imgA || imgB) return { a: imgA, b: imgB };

    // fallback: 연결된 입력 노드
    var conns = nodeEditor.connections.filter(function(c) { return c.to === node.id; });
    var images = [];
    for (var i = 0; i < conns.length && i < 2; i++) {
      var inputNode = nodeEditor.nodes.find(function(n) { return n.id === conns[i].from; });
      if (inputNode && inputNode.data && inputNode.data.image) {
        var src = inputNode.data.image;
        if (!src.startsWith('data:')) src = 'data:image/png;base64,' + src;
        images.push(src);
      }
    }
    return { a: images[0] || null, b: images[1] || null };
  }

  function _renderCompareView() {
    var node = nodeEditor.nodes.find(function(n) { return n.id === nodeEditor.selectedNode; });
    if (!node || node.type !== 'compare') return;

    var compareContent = document.querySelector('.node-preview-tab-content[data-content="compare"]');
    if (!compareContent) return;

    var imgs = _getCompareImages(node);
    var mode = node.data.mode || 'slider';

    if (!imgs.a && !imgs.b) {
      compareContent.innerHTML = '<div class="node-inspector-preview-image"><span class="node-inspector-preview-empty">Connect 2 nodes to compare</span></div>';
      return;
    }

    if (mode === 'side_by_side') {
      compareContent.innerHTML =
        '<div class="compare-side-by-side">' +
          '<div class="compare-side">' + (imgs.a ? '<img src="' + imgs.a + '" alt="A">' : '<span class="node-inspector-preview-empty">No image A</span>') + '<div class="compare-label">A</div></div>' +
          '<div class="compare-side">' + (imgs.b ? '<img src="' + imgs.b + '" alt="B">' : '<span class="node-inspector-preview-empty">No image B</span>') + '<div class="compare-label">B</div></div>' +
        '</div>';
    } else {
      // Slider mode
      compareContent.innerHTML =
        '<div class="compare-slider-container">' +
          '<div class="compare-slider-img-a">' + (imgs.a ? '<img src="' + imgs.a + '" alt="A">' : '') + '</div>' +
          '<div class="compare-slider-img-b">' + (imgs.b ? '<img src="' + imgs.b + '" alt="B">' : '') + '</div>' +
          '<div class="compare-slider-divider" id="compare-divider"><div class="compare-slider-handle"></div></div>' +
          '<div class="compare-label" style="left:8px;">A</div>' +
          '<div class="compare-label" style="right:8px;">B</div>' +
        '</div>';

      // 슬라이더 드래그 이벤트
      var container = compareContent.querySelector('.compare-slider-container');
      var divider = document.getElementById('compare-divider');
      var imgB = compareContent.querySelector('.compare-slider-img-b');
      if (container && divider && imgB) {
        var isDragging = false;
        divider.addEventListener('mousedown', function() { isDragging = true; });
        document.addEventListener('mousemove', function(e) {
          if (!isDragging) return;
          var rect = container.getBoundingClientRect();
          var x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
          var pct = (x / rect.width) * 100;
          divider.style.left = pct + '%';
          imgB.style.clipPath = 'inset(0 0 0 ' + pct + '%)';
        });
        document.addEventListener('mouseup', function() { isDragging = false; });
      }
    }
  }

})();
