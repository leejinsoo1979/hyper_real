// NanoBanana - Extended Node Types (modifier, upscale, video, compare)
// 레지스트리 방식: nodeEditor의 _icons, _titles, _noOutputTypes에 추가만 함
// renderNode를 오버라이드하지 않음!

(function() {

  // ============================================================
  // 1. 아이콘/타이틀 레지스트리에 새 타입 등록
  // ============================================================
  nodeEditor._icons.modifier = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
  nodeEditor._icons.upscale = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
  nodeEditor._icons.video = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none"/></svg>';
  nodeEditor._icons.compare = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/><path d="M9 8l-3 4 3 4"/><path d="M15 8l3 4-3 4"/></svg>';

  nodeEditor._titles.modifier = 'Modifier';
  nodeEditor._titles.upscale = 'Upscale';
  nodeEditor._titles.video = 'Video';
  nodeEditor._titles.compare = 'Compare';

  // compare, video는 output 포트 없음
  nodeEditor._noOutputTypes.compare = true;
  nodeEditor._noOutputTypes.video = true;

  // ============================================================
  // 2. getDefaultData 확장
  // ============================================================
  var _extDefaults = {
    modifier: function() {
      return {
        prompt: '',
        presetId: null,
        negativePrompt: '',
        mask: null,
        customPrompt: ''
      };
    },
    upscale: function() {
      return {
        scale: 2,
        optimizedFor: 'standard',
        creativity: 0.5,
        detailStrength: 0.5,
        similarity: 0.5,
        promptStrength: 0.5,
        prompt: 'Upscale',
        customPrompt: ''
      };
    },
    video: function() {
      return {
        engine: 'kling',
        duration: 5,
        prompt: 'Move forward',
        endFrameImage: null,
        customPrompt: ''
      };
    },
    compare: function() {
      return {
        mode: 'slider',
        imageA: null,
        imageB: null
      };
    }
  };

  var _origGetDefault = nodeEditor.getDefaultData;
  nodeEditor.getDefaultData = function(type) {
    if (_extDefaults[type]) return _extDefaults[type]();
    return _origGetDefault.call(nodeEditor, type);
  };

  // ============================================================
  // 3. addNodeBelow 확장
  // ============================================================
  var _origAddNodeBelow = nodeEditor.addNodeBelow;
  nodeEditor.addNodeBelow = function(clickedNode, newType) {
    if (!_extDefaults[newType]) {
      return _origAddNodeBelow.apply(nodeEditor, arguments);
    }

    var sameTypeNodes = nodeEditor.nodes.filter(function(n) { return n.type === newType; });
    var targetX, targetY;

    if (sameTypeNodes.length > 0) {
      var bottomNode = sameTypeNodes.reduce(function(a, b) { return a.y > b.y ? a : b; });
      targetX = bottomNode.x;
      targetY = bottomNode.y + 260;
    } else {
      targetX = clickedNode.x + 400;
      targetY = clickedNode.y;
    }

    var newNode = nodeEditor.addNode(newType, targetX, targetY);
    if (newType !== 'compare') {
      nodeEditor.connect(clickedNode.id, newNode.id);
    }
  };

  // ============================================================
  // 4. 노드 상태 관리
  // ============================================================
  var STATUS_CLASSES = ['status-idle', 'status-queued', 'status-running', 'status-done', 'status-error', 'status-blocked'];

  function _updateNodeStatus(nodeId, status) {
    var node = nodeEditor.nodes.find(function(n) { return n.id === nodeId; });
    if (node) node.status = status;

    var el = document.getElementById('node-' + nodeId);
    if (!el) return;

    // 모든 상태 클래스 제거 후 새 상태 추가
    for (var i = 0; i < STATUS_CLASSES.length; i++) {
      el.classList.remove(STATUS_CLASSES[i]);
    }
    el.classList.remove('processing');
    el.classList.add('status-' + status);

    // running 오버레이 관리
    var overlay = el.querySelector('.node-running-overlay');
    if (status === 'running') {
      el.classList.add('processing');

      // 1) 소스 이미지를 블러 처리해서 썸네일에 표시
      if (node && node.type !== 'source') {
        var inputConn = nodeEditor.connections.find(function(c) { return c.to === nodeId; });
        if (inputConn) {
          var inputNode = nodeEditor.nodes.find(function(n) { return n.id === inputConn.from; });
          if (inputNode && inputNode.thumbnail) {
            var thumb = el.querySelector('.node-thumbnail');
            if (thumb) {
              // 기존 아이콘 제거, 블러 이미지로 교체
              thumb.innerHTML = '<img src="data:image/png;base64,' + inputNode.thumbnail + '" style="filter:blur(12px) brightness(0.5);transform:scale(1.1);">';
            }
          }
        }
      }

      // 2) 회전 보더 스피너 생성
      if (!el.querySelector('.node-border-spinner')) {
        var spinner = document.createElement('div');
        spinner.className = 'node-border-spinner';
        spinner.innerHTML = '<div class="node-border-spinner-mask"></div>';
        el.appendChild(spinner);
      }

      // 3) 오버레이 생성 — 스피너 + 타이머
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'node-running-overlay';
        overlay.innerHTML =
          '<div class="node-shimmer"></div>' +
          '<div class="node-running-content">' +
            '<div class="node-running-ring"><div class="node-running-ring-inner"></div></div>' +
            '<div class="node-running-timer" id="node-timer-' + nodeId + '">00:00</div>' +
            '<div class="node-running-label">Rendering...</div>' +
          '</div>';
        // 오버레이를 thumbnail 영역 위에 삽입
        var thumbEl = el.querySelector('.node-thumbnail');
        if (thumbEl) {
          thumbEl.style.position = 'relative';
          thumbEl.appendChild(overlay);
        } else {
          el.appendChild(overlay);
        }
      }

      // 4) 노드별 타이머 시작
      if (!el._nodeTimerStart) el._nodeTimerStart = Date.now();
      if (el._nodeTimerInterval) clearInterval(el._nodeTimerInterval);
      el._nodeTimerInterval = setInterval(function() {
        var timerEl = document.getElementById('node-timer-' + nodeId);
        if (!timerEl) return;
        var elapsed = Math.floor((Date.now() - el._nodeTimerStart) / 1000);
        var m = Math.floor(elapsed / 60);
        var s = elapsed % 60;
        timerEl.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      }, 1000);
    } else {
      // 모든 오버레이 + 보더 스피너 제거 (중복 생성 대비)
      var allOverlays = el.querySelectorAll('.node-running-overlay');
      for (var oi = 0; oi < allOverlays.length; oi++) allOverlays[oi].remove();
      var allSpinners = el.querySelectorAll('.node-border-spinner');
      for (var si = 0; si < allSpinners.length; si++) allSpinners[si].remove();
      if (el._nodeTimerInterval) {
        clearInterval(el._nodeTimerInterval);
        el._nodeTimerInterval = null;
      }
      el._nodeTimerStart = null;
      // 블러 이미지도 제거 (done일 때는 renderNode가 최종 이미지로 교체)
      // idle/error로 돌아갈 때는 원래 아이콘으로 복원
      if (status !== 'done' && node && !node.thumbnail) {
        nodeEditor.renderNode(node);
      }
    }
  }

  // 에러 전파: 하위 노드를 blocked 상태로
  function _markDescendantsBlocked(nodeId) {
    var queue = [nodeId];
    var visited = {};
    visited[nodeId] = true;

    while (queue.length > 0) {
      var current = queue.shift();
      var outConns = nodeEditor.connections.filter(function(c) { return c.from === current; });
      for (var i = 0; i < outConns.length; i++) {
        var childId = outConns[i].to;
        if (!visited[childId]) {
          visited[childId] = true;
          _updateNodeStatus(childId, 'blocked');
          queue.push(childId);
        }
      }
    }
  }

  // ============================================================
  // 5. 레벨별 토폴로지 정렬 (Kahn's Algorithm)
  // ============================================================
  function _topologicalSortLevels() {
    var nodes = nodeEditor.nodes;
    var conns = nodeEditor.connections;

    // 진입 차수 계산
    var inDegree = {};
    var nodeMap = {};
    for (var i = 0; i < nodes.length; i++) {
      inDegree[nodes[i].id] = 0;
      nodeMap[nodes[i].id] = nodes[i];
    }
    for (var i = 0; i < conns.length; i++) {
      if (inDegree[conns[i].to] !== undefined) {
        inDegree[conns[i].to]++;
      }
    }

    // 진입 차수 0인 노드 = 첫 번째 레벨
    var queue = [];
    for (var id in inDegree) {
      if (inDegree[id] === 0) queue.push(parseInt(id));
    }

    var levels = [];
    while (queue.length > 0) {
      levels.push(queue.slice()); // 현재 레벨 복사
      var nextQueue = [];
      for (var q = 0; q < queue.length; q++) {
        var nodeId = queue[q];
        var outConns = conns.filter(function(c) { return c.from === nodeId; });
        for (var j = 0; j < outConns.length; j++) {
          var childId = outConns[j].to;
          inDegree[childId]--;
          if (inDegree[childId] === 0) {
            nextQueue.push(childId);
          }
        }
      }
      queue = nextQueue;
    }

    return levels;
  }

  // ============================================================
  // 6. 노드별 실행 함수
  // ============================================================

  // 입력 이미지 가져오기 (공통 헬퍼)
  function _getInputImage(node) {
    var inputConn = nodeEditor.connections.find(function(c) { return c.to === node.id; });
    if (!inputConn) return null;
    var srcNode = nodeEditor.nodes.find(function(n) { return n.id === inputConn.from; });
    if (!srcNode || !srcNode.data.image) return null;
    return srcNode.data.image;
  }

  // 실행 결과 적용 (공통 헬퍼)
  function _applyResult(node, result) {
    if (result.success) {
      node.data.image = result.image;
      downscaleThumbnail(result.image, function(thumb) {
        node.thumbnail = thumb;
        nodeEditor.renderNode(node);
        if (nodeEditor.selectedNode === node.id) {
          nodeEditor.updateInspector();
        }
        requestAnimationFrame(function() { nodeEditor.renderConnections(); });
      });
      // History에 자동 저장
      nodeEditor.saveToHistory({
        image: result.image,
        prompt: node.data.customPrompt || node.data.prompt || '',
        negativePrompt: node.data.negativePrompt || '',
        nodeType: node.type,
        source: 'node'
      });
    }
  }

  // Modifier 노드 실행
  function _executeModifierNode(node) {
    var inputImage = _getInputImage(node);
    if (!inputImage) return Promise.resolve();

    var renderId = 'node_' + node.id;
    var prompt = nodeEditor.assemblePrompt(node);
    var negPrompt = nodeEditor.assembleNegativePrompt(node);

    return new Promise(function(resolve, reject) {
      window._nodeRendererCallbacks[renderId] = function(result) {
        delete window._nodeRendererCallbacks[renderId];
        if (result.success) {
          _applyResult(node, result);
          resolve();
        } else {
          reject(new Error(result.error || 'Modifier failed'));
        }
      };

      // modifier는 입력 이미지 + mask + 프롬프트 전달
      // Ruby 측에서 modifier 타입을 인식하여 처리
      sketchup.startRender(
        'day', 'on',
        prompt,
        negPrompt,
        renderId
      );

      setTimeout(function() {
        if (window._nodeRendererCallbacks[renderId]) {
          delete window._nodeRendererCallbacks[renderId];
          reject(new Error('Modifier timeout'));
        }
      }, 120000);
    });
  }

  // Upscale 노드 실행
  function _executeUpscaleNode(node) {
    var inputImage = _getInputImage(node);
    if (!inputImage) return Promise.resolve();

    var renderId = 'node_' + node.id;
    var prompt = nodeEditor.assemblePrompt(node);

    return new Promise(function(resolve, reject) {
      window._nodeRendererCallbacks[renderId] = function(result) {
        delete window._nodeRendererCallbacks[renderId];
        if (result.success) {
          _applyResult(node, result);
          resolve();
        } else {
          reject(new Error(result.error || 'Upscale failed'));
        }
      };

      // Upscale: scale, optimizedFor 파라미터 포함
      // Ruby 측에 start_upscale 콜백이 있으면 사용, 없으면 startRender fallback
      if (typeof sketchup.startUpscale === 'function') {
        sketchup.startUpscale(inputImage, node.data.scale, prompt, renderId);
      } else {
        sketchup.startRender('day', 'on', prompt, '', renderId);
      }

      setTimeout(function() {
        if (window._nodeRendererCallbacks[renderId]) {
          delete window._nodeRendererCallbacks[renderId];
          reject(new Error('Upscale timeout'));
        }
      }, 120000);
    });
  }

  // Video 노드 실행
  function _executeVideoNode(node) {
    var inputImage = _getInputImage(node);
    if (!inputImage) return Promise.resolve();

    var renderId = 'node_' + node.id;
    var prompt = nodeEditor.assemblePrompt(node);

    return new Promise(function(resolve, reject) {
      window._nodeRendererCallbacks[renderId] = function(result) {
        delete window._nodeRendererCallbacks[renderId];
        if (result.success) {
          node.data.videoUrl = result.videoUrl || null;
          _applyResult(node, result);
          resolve();
        } else {
          reject(new Error(result.error || 'Video failed'));
        }
      };

      // Video: engine, duration 파라미터 포함
      if (typeof sketchup.startVideo === 'function') {
        sketchup.startVideo(inputImage, node.data.engine, node.data.duration, prompt, renderId);
      } else {
        sketchup.startRender('day', 'on', prompt, '', renderId);
      }

      setTimeout(function() {
        if (window._nodeRendererCallbacks[renderId]) {
          delete window._nodeRendererCallbacks[renderId];
          reject(new Error('Video timeout'));
        }
      }, 180000); // 비디오는 3분 타임아웃
    });
  }

  // ============================================================
  // 7. execute 확장 - 레벨별 병렬 실행
  // ============================================================
  nodeEditor.isRunning = false;
  nodeEditor._timerInterval = null;
  nodeEditor._startTime = 0;

  var _origExecute = nodeEditor.execute;
  nodeEditor.execute = function() {
    console.log('[NodeTypes] Overridden execute called, dirty=' + nodeEditor.dirty + ', isRunning=' + nodeEditor.isRunning + ', nodes=' + nodeEditor.nodes.length);
    if (!nodeEditor.dirty || nodeEditor.isRunning) {
      console.warn('[NodeTypes] Execute blocked: dirty=' + nodeEditor.dirty + ', isRunning=' + nodeEditor.isRunning);
      return;
    }
    nodeEditor.isRunning = true;
    nodeEditor.startFlowAnimation();

    var makeBtn = document.getElementById('node-make-btn');
    makeBtn.disabled = true;

    // 타이머 시작
    nodeEditor._startTime = Date.now();
    function _formatTime(ms) {
      var s = Math.floor(ms / 1000);
      var m = Math.floor(s / 60);
      s = s % 60;
      return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }
    function _updateTimer() {
      var elapsed = Date.now() - nodeEditor._startTime;
      makeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;animation:spin 1s linear infinite;"><path d="M12 2a10 10 0 1 0 10 10"/></svg> ' + _formatTime(elapsed);
    }
    _updateTimer();
    nodeEditor._timerInterval = setInterval(_updateTimer, 1000);

    // 모든 dirty 노드를 queued 상태로
    var dirtyCount = 0;
    nodeEditor.nodes.forEach(function(n) {
      console.log('[NodeTypes] Node ' + n.id + ' type=' + n.type + ' dirty=' + n.dirty + ' status=' + n.status);
      if (n.dirty) { _updateNodeStatus(n.id, 'queued'); dirtyCount++; }
    });
    console.log('[NodeTypes] Total dirty nodes: ' + dirtyCount);

    var levels = _topologicalSortLevels();
    console.log('[NodeTypes] Topology levels: ' + levels.length, JSON.stringify(levels));

    // 레벨별 재귀 실행
    function executeLevel(levelIndex) {
      console.log('[NodeTypes] executeLevel(' + levelIndex + '/' + levels.length + ')');
      if (levelIndex >= levels.length) {
        console.log('[NodeTypes] All levels complete');
        _onExecutionComplete(makeBtn);
        return;
      }

      var level = levels[levelIndex];
      var promises = [];

      for (var i = 0; i < level.length; i++) {
        var nodeId = level[i];
        var node = nodeEditor.nodes.find(function(n) { return n.id === nodeId; });
        if (!node || !node.dirty || node.status === 'blocked') {
          console.log('[NodeTypes] Skipping node ' + nodeId + ' at level ' + levelIndex + ' (not dirty or blocked)');
          continue;
        }

        promises.push(_executeOneNode(node));
      }

      console.log('[NodeTypes] Level ' + levelIndex + ': ' + promises.length + ' promises');
      if (promises.length === 0) {
        executeLevel(levelIndex + 1);
        return;
      }

      Promise.all(promises).then(function() {
        executeLevel(levelIndex + 1);
      }).catch(function(err) {
        console.error('[Pipeline] Level execution error:', err);
        _onExecutionComplete(makeBtn);
      });
    }

    executeLevel(0);
  };

  // 단일 노드 실행 (타입별 분기)
  function _executeOneNode(node) {
    console.log('[NodeTypes] _executeOneNode: id=' + node.id + ' type=' + node.type);
    // 캐시 키 비교 — source 제외 (항상 실행)
    if (node.type !== 'source' && nodeEditor.shouldSkipExecution(node)) {
      console.log('[NodeTypes] Skipping node ' + node.id + ' (cache hit)');
      _updateNodeStatus(node.id, 'done');
      return Promise.resolve();
    }

    _updateNodeStatus(node.id, 'running');
    console.log('[NodeTypes] Executing node ' + node.id + ' type=' + node.type);

    var promise;
    try {
      if (node.type === 'source') {
        console.log('[NodeTypes] Calling executeSourceNode for ' + node.id);
        promise = nodeEditor.executeSourceNode(node);
      } else if (node.type === 'renderer') {
        console.log('[NodeTypes] Calling executeRendererNode for ' + node.id);
        promise = nodeEditor.executeRendererNode(node);
      } else if (node.type === 'modifier') {
        promise = _executeModifierNode(node);
      } else if (node.type === 'upscale') {
        promise = _executeUpscaleNode(node);
      } else if (node.type === 'video') {
        promise = _executeVideoNode(node);
      } else {
        promise = Promise.resolve();
      }
      // 안전장치: undefined 반환 시 resolve로 대체
      if (!promise || typeof promise.then !== 'function') {
        console.warn('[NodeTypes] Node ' + node.id + ' returned non-promise, wrapping');
        promise = Promise.resolve();
      }
    } catch (err) {
      console.error('[NodeTypes] Sync error executing node ' + node.id + ':', err);
      promise = Promise.reject(err);
    }

    return promise.then(function() {
      node.dirty = false;
      _updateNodeStatus(node.id, 'done');
      // 크레딧 차감
      var cost = nodeEditor.getCostForNode(node);
      nodeEditor.credits = Math.max(0, nodeEditor.credits - cost);
      nodeEditor.updateCreditsDisplay();
      nodeEditor.renderNode(node);
    }).catch(function(err) {
      console.error('[Node] Execution error:', node.id, err.message);
      _updateNodeStatus(node.id, 'error');
      _markDescendantsBlocked(node.id);
      nodeEditor.updateCreditsDisplay();
    });
  }

  // 실행 완료 처리
  function _onExecutionComplete(makeBtn) {
    // 흐름 애니메이션 정지
    nodeEditor.stopFlowAnimation();
    // 타이머 정지
    if (nodeEditor._timerInterval) {
      clearInterval(nodeEditor._timerInterval);
      nodeEditor._timerInterval = null;
    }
    var elapsed = Date.now() - nodeEditor._startTime;
    var sec = (elapsed / 1000).toFixed(1);

    nodeEditor.dirty = false;
    nodeEditor.isRunning = false;
    makeBtn.disabled = false;

    // 완료 시간 표시 → 3초 후 원래 Make 텍스트로 복귀
    makeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#00d4aa" stroke-width="2" style="width:14px;height:14px;"><polyline points="20 6 9 17 4 12"/></svg> Done ' + sec + 's';
    setTimeout(function() {
      makeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px;"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> Make';
    }, 3000);

    nodeEditor.updateCreditsDisplay();
  }

  // ============================================================
  // 8. connect 확장 - 순환 금지, 말단 노드 출력 금지
  // ============================================================
  var _origConnect = nodeEditor.connect;
  nodeEditor.connect = function(fromId, toId) {
    var fromNode = nodeEditor.nodes.find(function(n) { return n.id === fromId; });
    var toNode = nodeEditor.nodes.find(function(n) { return n.id === toId; });
    if (!fromNode || !toNode) return;

    // output 포트 없는 타입은 연결 불가
    if (nodeEditor._noOutputTypes[fromNode.type]) return;

    if (_hasCycle(fromId, toId)) return;

    _origConnect.apply(nodeEditor, arguments);
  };

  // 순환 검사
  function _hasCycle(fromId, toId) {
    var visited = {};
    function dfs(id) {
      if (id === fromId) return true;
      if (visited[id]) return false;
      visited[id] = true;
      var outConns = nodeEditor.connections.filter(function(c) { return c.from === id; });
      for (var i = 0; i < outConns.length; i++) {
        if (dfs(outConns[i].to)) return true;
      }
      return false;
    }
    return dfs(toId);
  }

})();
