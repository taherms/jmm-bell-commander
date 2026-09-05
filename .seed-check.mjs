export default async function run(page) {
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase('jmm-bell-commander');
      request.onsuccess = request.onerror = request.onblocked = resolve;
    });
  });
  await page.reload();
  await page.locator('#login-password').fill('madrasa786');
  await page.locator('#login-submit-btn').click();
  await page.waitForSelector('#override-select');
  await page.waitForTimeout(300);
  const seeded = await page.evaluate(async () => ({
    timetableNames: JSON.parse(localStorage.getItem('jmm_timetables')).map((t) => t.name),
    settings: JSON.parse(localStorage.getItem('jmm_settings')),
    customRingCount: (await new Promise((resolve, reject) => {
      const request = indexedDB.open('jmm-bell-commander');
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('customRings', 'readonly');
        const getAll = tx.objectStore('customRings').getAll();
        getAll.onsuccess = () => resolve(getAll.result.length);
        getAll.onerror = () => reject(getAll.error);
      };
      request.onerror = () => reject(request.error);
    }))
  }));
  await page.evaluate(() => {
    localStorage.setItem('jmm_timetables', JSON.stringify([{ id: 'existing', name: 'Existing', assignment: { type: 'weekday', days: [] }, bells: [] }]));
    localStorage.setItem('jmm_settings', JSON.stringify({ volume: 0.1 }));
  });
  await page.reload();
  await page.waitForSelector('#override-select');
  const preserved = await page.evaluate(() => ({
    timetableNames: JSON.parse(localStorage.getItem('jmm_timetables')).map((t) => t.name),
    volume: JSON.parse(localStorage.getItem('jmm_settings')).volume
  }));
  return { seeded, preserved };
}
