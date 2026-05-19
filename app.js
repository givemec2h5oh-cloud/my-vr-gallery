/* =========================================================
   Віртуальне портфоліо (A-Frame) — єдиний шаблон
   Студенти НЕ пишуть код. Вони лише:
   1) підставляють assets/room.glb
   2) додають works/WORK_XX.* (UPPERCASE)
   3) заповнюють config/config.json (UPPERCASE ключі)
   ========================================================= */

const CONFIG_PATH = "./config/config.json";

/** Утиліта: безпечний доступ до DOM */
const $ = (sel) => document.querySelector(sel);

/** UI панель опису */
const ui = {
  panel: $("#infoPanel"),
  title: $("#infoTitle"),
  meta: $("#infoMeta"),
  desc: $("#infoDesc"),
  closeBtn: $("#closeInfo"),
  open(work) {
    this.title.textContent = work.TITLE || work.WORK_ID || "Без назви";
    const metaParts = [];
    if (work.AUTHOR) metaParts.push(work.AUTHOR);
    if (work.YEAR) metaParts.push(String(work.YEAR));
    if (work.TECHNIQUE) metaParts.push(work.TECHNIQUE);
    this.meta.textContent = metaParts.join(" · ") || "—";
    this.desc.textContent = work.DESCRIPTION || "—";
    this.panel.style.display = "block";
  },
  close() {
    this.panel.style.display = "none";
  }
};

ui.closeBtn.addEventListener("click", () => ui.close());

/** Завантажити JSON */
async function loadConfig() {
  const res = await fetch(CONFIG_PATH, { cache: "no-store" });
  if (!res.ok) throw new Error(`Не вдалося завантажити ${CONFIG_PATH}. Статус: ${res.status}`);
  const cfg = await res.json();
  return cfg;
}

/** Перевірка стилю: UPPERCASE ключі (рекомендована, не блокує) */
function warnIfNotUppercaseKeys(obj, prefix = "ROOT") {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => warnIfNotUppercaseKeys(v, `${prefix}[${i}]`));
    return;
  }
  for (const k of Object.keys(obj)) {
    if (k !== k.toUpperCase()) {
      console.warn(`[CONFIG] Ключ не UPPERCASE: ${prefix}.${k}`);
    }
    warnIfNotUppercaseKeys(obj[k], `${prefix}.${k}`);
  }
}

/** Допоміжне: завантажити зображення та отримати його пропорції */
function loadImageInfo(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error(`Не вдалося завантажити зображення: ${url}`));
    img.src = url;
  });
}

/** Режим 1 — CONTAIN: вписати зображення у прямокутник INNER_W × INNER_H без обрізання */
function computeContainSize(innerW, innerH, imgW, imgH) {
  const innerAspect = innerW / innerH;
  const imgAspect = imgW / imgH;
  if (imgAspect >= innerAspect) {
    // зображення “ширше” — ширина = максимум, висота зберігає пропорцію
    return { w: innerW, h: innerW / imgAspect };
  }
  // зображення “вище” — висота = максимум, ширина зберігає пропорцію
  return { w: innerH * imgAspect, h: innerH };
}

/** Знайти об’єкт у GLB за ім’ям */
function getByName(root3D, name) {
  return root3D.getObjectByName(name);
}

/** Клонувати матеріал mesh’а, щоб можна було змінювати параметри локально */
function ensureUniqueMaterial(mesh) {
  if (!mesh || !mesh.material) return;
  if (Array.isArray(mesh.material)) {
    mesh.material = mesh.material.map((m) => m.clone());
  } else {
    mesh.material = mesh.material.clone();
  }
}

/** Застосувати оверрайд матеріалу (колір/текстура/metalness/roughness) */
async function applyMaterialOverride(mesh, override) {
  if (!mesh || !mesh.material) return;

  // Для безпеки: робимо матеріал унікальним, щоб не “перефарбувати” інші об’єкти
  ensureUniqueMaterial(mesh);

  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const colorHex = override.COLOR || null;
  const metalness = override.METALNESS;
  const roughness = override.ROUGHNESS;
  const mapPath = override.TEXTURE || null;

  // Можна таргетити підматеріал за індексом
  const targetIndex = typeof override.MATERIAL_INDEX === "number" ? override.MATERIAL_INDEX : null;

  for (let i = 0; i < mats.length; i++) {
    if (targetIndex !== null && i !== targetIndex) continue;
    const m = mats[i];
    if (colorHex && m.color) m.color.set(colorHex);
    if (typeof metalness === "number" && "metalness" in m) m.metalness = metalness;
    if (typeof roughness === "number" && "roughness" in m) m.roughness = roughness;

    if (mapPath) {
      const tex = await new Promise((resolve, reject) => {
        const loader = new THREE.TextureLoader();
        loader.load(mapPath, resolve, undefined, reject);
      });
      tex.colorSpace = THREE.SRGBColorSpace;
      if (override.REPEAT && Array.isArray(override.REPEAT) && override.REPEAT.length === 2) {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(override.REPEAT[0], override.REPEAT[1]);
      }
      m.map = tex;
      m.needsUpdate = true;
    }
  }
}

/** Додати світло зі списку в config.json (світло НЕ експортуємо з Blender) */
function buildLightsFromConfig(cfg) {
  const lightsRoot = $("#lights");
  lightsRoot.innerHTML = ""; // очистити

  const arr = cfg?.LIGHTS?.LIST;
  if (!Array.isArray(arr) || arr.length === 0) return;

  arr.forEach((L) => {
    const e = document.createElement("a-entity");
    // тип: ambient / directional / point / spot
    const type = (L.TYPE || "point").toLowerCase();
    const color = L.COLOR || "#ffffff";
    const intensity = typeof L.INTENSITY === "number" ? L.INTENSITY : 1.0;
    const distance = typeof L.DISTANCE === "number" ? L.DISTANCE : 0.0;
    const decay = typeof L.DECAY === "number" ? L.DECAY : 2.0;
    const angle = typeof L.ANGLE === "number" ? L.ANGLE : 45;
    const penumbra = typeof L.PENUMBRA === "number" ? L.PENUMBRA : 0.2;

    let lightStr = `type: ${type}; color: ${color}; intensity: ${intensity};`;
    if (type === "point" || type === "spot") lightStr += ` distance: ${distance}; decay: ${decay};`;
    if (type === "spot") lightStr += ` angle: ${THREE.MathUtils.degToRad(angle)}; penumbra: ${penumbra};`;

    e.setAttribute("light", lightStr);

    const p = L.POSITION || [0, 3, 0];
    const r = L.ROTATION || [0, 0, 0];
    e.setAttribute("position", `${p[0]} ${p[1]} ${p[2]}`);
    e.setAttribute("rotation", `${r[0]} ${r[1]} ${r[2]}`);

    lightsRoot.appendChild(e);
  });
}

/** Завантажити кімнату GLB у сцену */
function loadRoom(cfg) {
  const room = $("#room");
  const glbPath = cfg?.ROOM?.GLB_PATH || "./assets/room.glb";
  const pos = cfg?.ROOM?.POSITION || [0,0,0];
  const rot = cfg?.ROOM?.ROTATION || [0,0,0];
  const scale = cfg?.ROOM?.SCALE ?? 1;

  room.setAttribute("gltf-model", `url(${glbPath})`);
  room.setAttribute("position", `${pos[0]} ${pos[1]} ${pos[2]}`);
  room.setAttribute("rotation", `${rot[0]} ${rot[1]} ${rot[2]}`);
  room.setAttribute("scale", `${scale} ${scale} ${scale}`);

  return room;
}

/** Застосувати матеріальні оверрайди для кімнати (стіни/підлога/стеля/ніші/колони/перегородки/рамки) */
async function applyMaterialOverrides(root3D, cfg) {
  const list = cfg?.MATERIAL_OVERRIDES;
  if (!Array.isArray(list) || list.length === 0) return;

  // Принцип: шукаємо meshes, у яких є material.name == override.MATERIAL_NAME
  // і застосовуємо оверрайд. Це працює, якщо у GLB правильні назви матеріалів (MAT_...).
  root3D.traverse(async (obj) => {
    if (!obj.isMesh || !obj.material) return;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const ov of list) {
      const targetName = ov.MATERIAL_NAME;
      if (!targetName) continue;

      // Якщо є MATERIAL_INDEX — таргетимо тільки підматеріал
      if (typeof ov.MATERIAL_INDEX === "number") {
        const idx = ov.MATERIAL_INDEX;
        if (mats[idx] && mats[idx].name === targetName) {
          await applyMaterialOverride(obj, ov);
        }
        continue;
      }

      // Інакше — якщо хоча б один підматеріал має таку назву
      if (mats.some(m => m?.name === targetName)) {
        await applyMaterialOverride(obj, ov);
      }
    }
  });
}

/** Побудувати “роботи” у слотах HOOK_XX / FRM_XX (Стандарт HOOK/FRM) */
async function buildWorks(root3D, cfg) {
  const slots = cfg?.SLOTS;
  const works = cfg?.WORKS;

  if (!Array.isArray(slots) || slots.length === 0) {
    console.warn("[SLOTS] Немає SLOTS у config.json");
    return;
  }
  if (!Array.isArray(works) || works.length === 0) {
    console.warn("[WORKS] Немає WORKS у config.json");
    return;
  }

  // Карта слотів за SLOT_ID
  const slotById = new Map(slots.map(s => [s.SLOT_ID, s]));

  // Автопризначення: якщо WORK.SLOT_ID відсутній — беремо слот за індексом
  for (let i = 0; i < works.length; i++) {
    const work = works[i];
    const slotId = work.SLOT_ID || slots[i]?.SLOT_ID;
    if (!slotId) continue;

    const slot = slotById.get(slotId);
    if (!slot) {
      console.warn(`[SLOTS] Невідомий SLOT_ID: ${slotId} (для роботи ${work.WORK_ID || i})`);
      continue;
    }

    const hookName = slot.HOOK_NAME;
    const hookObj = getByName(root3D, hookName);
    if (!hookObj) {
      console.warn(`[HOOK] Не знайдено у GLB: ${hookName} (слот ${slotId})`);
      continue;
    }

    // Створюємо A-Frame entity-площину як “полотно” роботи
    const imgFile = work.FILE; // Напр. "WORK_01.jpg"
    const imgUrl = `./works/${imgFile}`;

    // Отримаємо пропорції зображення
    let imgInfo = null;
    try {
      imgInfo = await loadImageInfo(imgUrl);
    } catch (e) {
      console.warn(e.message);
      // Якщо нема картинки — пропустити або поставити заглушку
      continue;
    }

    const innerW = Number(slot.INNER_W || 1.0);
    const innerH = Number(slot.INNER_H || 1.0);
    const size = computeContainSize(innerW, innerH, imgInfo.width, imgInfo.height);

    const plane = document.createElement("a-plane");
    plane.classList.add("clickable");
    plane.setAttribute("width", size.w);
    plane.setAttribute("height", size.h);

    // Матеріал: flat=false (реагує на світло), transparent=true для PNG з альфою
    plane.setAttribute("material", `src: url(${imgUrl}); shader: flat; side: double; transparent: true;`);
    plane.setAttribute("geometry", "primitive: plane");

    // Позиціюємо в точку HOOK_XX з невеликим зсувом вперед, щоб уникнути “миготіння” з рамою/стінкою
    const offset = Number(slot.IMAGE_OFFSET || 0.05);

    // Беремо світові координати HOOK
    const wp = new THREE.Vector3();
    const wq = new THREE.Quaternion();
    hookObj.getWorldPosition(wp);
    hookObj.getWorldQuaternion(wq);

    // Локальний “вперед” (у A-Frame/three.js це -Z для камери, але для об’єкта беремо його -Z як “нормаль”)
    const forward = new THREE.Vector3(0, 1, 0).applyQuaternion(wq); // +Z уздовж осі HOOK (ви задали її у Blender)
    const finalPos = wp.clone().add(forward.multiplyScalar(offset));
    

    plane.setAttribute("position", `${finalPos.x} ${finalPos.y} ${finalPos.z}`);
    

    // Орієнтація: з HOOK
    const euler = new THREE.Euler().setFromQuaternion(wq, "YXZ");
    const deg = {
      x: THREE.MathUtils.radToDeg(euler.x),
      y: THREE.MathUtils.radToDeg(euler.y),
      z: THREE.MathUtils.radToDeg(euler.z),
    };
    plane.setAttribute("rotation", `${deg.x+90} ${deg.y+180} ${deg.z+180}`);

    // Обробник кліку: показати праву плашку
    plane.addEventListener("click", () => ui.open(work));

    // Додаємо в сцену (у root a-scene)
    $("a-scene").appendChild(plane);
  }
}

/** Контроль відповідності (мінімальний): HOOK_XX існують; імена файлів WORK_XX.* UPPERCASE */
function basicComplianceChecks(cfg) {
  const works = cfg?.WORKS || [];
  for (const w of works) {
    if (!w.FILE) continue;
    if (w.FILE !== w.FILE.toUpperCase()) {
      console.warn(`[WORK FILE] Файл не UPPERCASE: ${w.FILE}. Рекомендація: WORK_01.jpg (UPPERCASE).`);
    }
    // Мінімальна перевірка шаблону
    if (!/^WORK_\d{2}\./.test(w.FILE)) {
      console.warn(`[WORK FILE] Нестандартне ім’я: ${w.FILE}. Рекомендований формат: WORK_01.jpg / WORK_02.png ...`);
    }
  }
}

/** Основний запуск */
/** Компонент для колізій (щоб не проходити крізь стіни та тумби) */
/** Компонент для колізій як "Тверда коробка" (AABB Box Collision) */
AFRAME.registerComponent('collide-walls', {
  init: function () {
    this.raycaster = new THREE.Raycaster();
    this.prevLocalPos = new THREE.Vector3();
    this.collisionMeshes = [];
    
    this.playerRadius = 0.25; // Радіус гравця (0.25 = ширина тіла 0.5 метра)
    this.rayHeight = 0.5; // Висота радара (на рівні колін)

    // Чекаємо завантаження 3D-моделі кімнати
    const roomEl = document.querySelector('#room');
    roomEl.addEventListener('model-loaded', () => {
      this.collisionMeshes = [roomEl.getObject3D('mesh')];
    });
  },

  tick: function () {
    if (this.collisionMeshes.length === 0) return;

    const obj = this.el.object3D;
    if (this.prevLocalPos.lengthSq() === 0) {
        this.prevLocalPos.copy(obj.position);
        return;
    }

    const currentPos = obj.position.clone();
    const delta = new THREE.Vector3().subVectors(currentPos, this.prevLocalPos);
    delta.y = 0; // Вертикаль ігноруємо

    // Якщо руху немає - нічого не рахуємо
    if (delta.lengthSq() < 0.000001) {
        this.prevLocalPos.copy(currentPos);
        return;
    }

    // Трохи зменшуємо ширину для крайніх променів (на 2 см), щоб не "прилипати" і не тертися об паралельні стіни
    const rEps = this.playerRadius - 0.02; 
    // 5 точок перевірки (від лівого плеча до правого)
    const offsets = [-rEps, -rEps/2, 0, rEps/2, rEps];

    // --- Перевірка руху по осі X ---
    if (Math.abs(delta.x) > 0) {
        const dirX = new THREE.Vector3(Math.sign(delta.x), 0, 0);
        let hitX = false;
        let minDistanceX = Math.abs(delta.x);

        for (let offset of offsets) {
            // Пускаємо промені вздовж X, але зміщуємо їх "ширину" по осі Z
            const origin = new THREE.Vector3(this.prevLocalPos.x, this.rayHeight, this.prevLocalPos.z + offset);
            if (obj.parent) obj.parent.localToWorld(origin);
            
            let worldDirX = dirX.clone();
            if (obj.parent) worldDirX.transformDirection(obj.parent.matrixWorld);

            this.raycaster.set(origin, worldDirX);
            const intersects = this.raycaster.intersectObjects(this.collisionMeshes, true);
            
            if (intersects.length > 0) {
                // Відстань, яку можна пройти до зіткнення (з урахуванням нашого радіуса)
                const distToWall = intersects[0].distance - this.playerRadius;
                if (distToWall < minDistanceX) {
                    minDistanceX = Math.max(0, distToWall);
                    hitX = true;
                }
            }
        }
        // Обмежуємо рух по X
        if (hitX) delta.x = Math.sign(delta.x) * minDistanceX;
    }

    // --- Перевірка руху по осі Z ---
    if (Math.abs(delta.z) > 0) {
        const dirZ = new THREE.Vector3(0, 0, Math.sign(delta.z));
        let hitZ = false;
        let minDistanceZ = Math.abs(delta.z);

        // ВАЖЛИВО: Використовуємо вже виправлену позицію X (це дозволяє ідеально ковзати по кутах)
        const newX = this.prevLocalPos.x + delta.x;

        for (let offset of offsets) {
            // Пускаємо промені вздовж Z, зміщуючи їх "ширину" по осі X
            const origin = new THREE.Vector3(newX + offset, this.rayHeight, this.prevLocalPos.z);
            if (obj.parent) obj.parent.localToWorld(origin);
            
            let worldDirZ = dirZ.clone();
            if (obj.parent) worldDirZ.transformDirection(obj.parent.matrixWorld);

            this.raycaster.set(origin, worldDirZ);
            const intersects = this.raycaster.intersectObjects(this.collisionMeshes, true);
            
            if (intersects.length > 0) {
                const distToWall = intersects[0].distance - this.playerRadius;
                if (distToWall < minDistanceZ) {
                    minDistanceZ = Math.max(0, distToWall);
                    hitZ = true;
                }
            }
        }
        // Обмежуємо рух по Z
        if (hitZ) delta.z = Math.sign(delta.z) * minDistanceZ;
    }

    // Застосовуємо безпечний фінальний рух
    obj.position.set(this.prevLocalPos.x + delta.x, currentPos.y, this.prevLocalPos.z + delta.z);
    this.prevLocalPos.copy(obj.position);
  }
});(async function main() {
  try {
    const cfg = await loadConfig();
    warnIfNotUppercaseKeys(cfg);
    basicComplianceChecks(cfg);

    // 1) Світло з config
    buildLightsFromConfig(cfg);

    // 2) Налаштування руху/висоти камери
    const cam = $("#camera");
    const rig = $("#rig");
    const playerH = cfg?.PLAYER?.HEIGHT ?? 1.65;
    const start = cfg?.PLAYER?.START_POSITION || [0, 0, 0];
    cam.setAttribute("position", `0 ${playerH} 0`);
    rig.setAttribute("position", `${start[0]} ${start[1]} ${start[2]}`);

    // ДОДАТИ ЦЕЙ РЯДОК: Увімкнути колізії для камери
    cam.setAttribute("collide-walls", "");

    // 3) Завантаження кімнати
    const room = loadRoom(cfg);

    // 4) Коли GLB завантажився — доступ до three.js сцени
    room.addEventListener("model-loaded", async () => {
      const root3D = room.getObject3D("mesh");
      if (!root3D) {
        console.error("GLB завантажився, але root3D недоступний (mesh).");
        return;
      }

      // 4.1) Матеріали (стіни/ніші/підлога/колони/перегородки/рамки)
      await applyMaterialOverrides(root3D, cfg);

      // 4.2) Роботи (площини з картинками) + кліки + плашка
      await buildWorks(root3D, cfg);

      console.log("✅ Шаблон портфоліо готовий: room.glb + WORK_XX.* + config.json");
    });

  } catch (e) {
    console.error(e);
    alert("Помилка запуску. Перевірте, що ви відкрили проєкт через сервер (Live Server), і що існує config/config.json та assets/room.glb.");
  }
})();
