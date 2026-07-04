from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 1600, 'height': 900})
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)[:200]))
    pg.goto('http://localhost:5199/', wait_until='networkidle')
    pg.wait_for_timeout(4000)

    # 1) Source 노드 선택 후 빈 캔버스 우클릭 → + 1. Main renderer
    pg.locator('.react-flow__node').first.click()
    pg.wait_for_timeout(300)
    pg.mouse.click(1100, 700, button='right')
    pg.wait_for_timeout(400)
    item = pg.get_by_text('+ 1. Main renderer')
    print('1. context menu add item:', item.count() > 0)
    item.first.click()
    pg.wait_for_timeout(500)
    n_nodes = pg.locator('.react-flow__node').count()
    n_edges = pg.locator('.react-flow__edge').count()
    print('2. render node created:', n_nodes == 2, '| auto-connected:', n_edges == 1)

    # 2) Render 노드 선택 상태 → Time/Lights 확인 + Night 선택
    print('3. Time/Night control:', pg.get_by_text('Night', exact=True).count() > 0)
    print('4. Lights control:', pg.get_by_text('Lights', exact=True).count() > 0)
    pg.get_by_text('Night', exact=True).click()
    pg.wait_for_timeout(200)

    # 3) Auto → 생성 중 Cancel 표시 → 완료 후 프롬프트/조명 반영
    auto = pg.locator('button:has-text("Auto")').last
    print('5. Auto enabled:', auto.is_enabled())
    auto.click()
    pg.wait_for_timeout(400)
    print('6. Cancel visible while loading:', pg.locator('button:has-text("Cancel")').count() > 0)
    pg.wait_for_timeout(2200)
    val = pg.locator('input[placeholder="Enter your image prompt here..."]').input_value()
    print('7. prompt auto-filled:', 'INPUT IMAGE PRESERVATION' in val)
    print('8. night lighting in prompt:', 'nighttime' in val)

    pg.screenshot(path='autoprompt_final.png')
    print('JS errors:', errors if errors else 'NONE')
    b.close()
