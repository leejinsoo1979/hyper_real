from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 1600, 'height': 900})
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)[:150]))
    pg.goto('http://localhost:5199/', wait_until='networkidle')
    pg.wait_for_timeout(4000)

    # 좌측 레일 Camera 클릭
    pg.get_by_text('Camera', exact=True).click()
    pg.wait_for_timeout(600)
    print('Scenes section:', pg.get_by_text('Scenes', exact=True).count() > 0)
    print('Move WASD:', pg.locator('button[title="전진"]').count() > 0)
    print('2점 투시:', pg.get_by_text('2점 투시 보정').count() > 0)
    print('preview img:', pg.locator('img').count() > 0)
    # 인스펙터(노드 에디터)에는 카메라가 없어야 함
    pg.get_by_text('Render', exact=True).first.click()
    pg.wait_for_timeout(500)
    pg.locator('.react-flow__node').first.click()
    pg.wait_for_timeout(400)
    print('노드 인스펙터에 카메라 없음:', pg.locator('button[title="전진"]').count() == 0)
    print('JS errors:', errors if errors else 'NONE')
    pg.screenshot(path='camera_page.png')
    b.close()
