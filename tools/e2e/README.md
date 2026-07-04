# E2E 도구

- `mock_bridge.py` — SketchUp 브릿지(포트 9876) 모의 서버. 새 프로토콜 전체(/api/ping, /api/data, /api/scenes, /api/command, /api/result) 구현
- `test_autoprompt2.py` — 노드 생성→Time/Lights→Auto→프롬프트 검증
- `test_camera_page.py` — Camera 페이지/씬 전환 검증
- `icon.html` — 툴바 아이콘 SVG 소스 (playwright 스크린샷으로 PNG 생성)

실행 (webapp-testing 스킬의 with_server.py 사용):
```bash
python3 ~/.claude/skills/webapp-testing/scripts/with_server.py \
  --server "python3 -u tools/e2e/mock_bridge.py" --port 9876 \
  --server "npm run dev --prefix webapp -- --port 5199" --port 5199 \
  -- python3 tools/e2e/test_autoprompt2.py
```
(테스트 스크립트 내 URL은 localhost:5199 기준)
