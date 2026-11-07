// ===========================
// THREE.JS 3D SCENE SETUP
// ===========================

let scene, camera, renderer, carGroup;

function initThreeJS() {
    const container = document.getElementById('threejs-container');
    if (!container) return;

    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x004E89);
    scene.fog = new THREE.Fog(0x004E89, 15, 40);

    // Camera setup
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    positionCamera(width / height);

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    // Sharp on high-density phone screens, capped at 2x to keep it smooth
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 10);
    directionalLight.castShadow = true;
    // Lighter shadows on small screens (phones/tablets) to save battery
    const shadowSize = window.innerWidth <= 1024 ? 1024 : 2048;
    directionalLight.shadow.mapSize.width = shadowSize;
    directionalLight.shadow.mapSize.height = shadowSize;
    directionalLight.shadow.camera.left = -15;
    directionalLight.shadow.camera.right = 15;
    directionalLight.shadow.camera.top = 15;
    directionalLight.shadow.camera.bottom = -15;
    scene.add(directionalLight);

    const pointLight = new THREE.PointLight(0xFF6B35, 0.5);
    pointLight.position.set(-5, 8, 5);
    scene.add(pointLight);

    // Create 3D Car
    carGroup = new THREE.Group();
    scene.add(carGroup);

    createCar();
    createEnvironment();
    createAnimatedElements();

    // Resize whenever the container changes size (window resize, rotation, breakpoints)
    if ('ResizeObserver' in window) {
        new ResizeObserver(onWindowResize).observe(container);
    } else {
        window.addEventListener('resize', debounce(onWindowResize, 250));
    }

    // Animation loop
    animate();
}

// ---------------------------
// The car model: a low-poly sedan in the brand orange.
// Front = +z, wheels rest on y = 0, and each wheel spins about its local x axis.
// ---------------------------
function buildCar() {
    const car = new THREE.Group();

    // ---- Materials ----
    const paint = new THREE.MeshStandardMaterial({ color: 0xFF6B35, metalness: 0.3, roughness: 0.35 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x14213a, metalness: 0.6, roughness: 0.15 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x1c1f26, metalness: 0.2, roughness: 0.6 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.9 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xd0d5dc, metalness: 0.35, roughness: 0.3 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfff4e0, emissive: 0xfff4e0, emissiveIntensity: 1 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff3b30, emissiveIntensity: 0.9 });

    function add(geometry, material, x, y, z, shadow) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        if (shadow) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
        }
        car.add(mesh);
        return mesh;
    }

    // Extrude a side profile (drawn with x = along the car, y = height) across the
    // car's width, then turn it so the profile runs along z with the front at +z
    function sideProfile(draw, width, bevel) {
        const shape = new THREE.Shape();
        draw(shape);
        const depth = width - bevel * 2;
        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: depth,
            bevelEnabled: true,
            bevelThickness: bevel,
            bevelSize: bevel,
            bevelSegments: 2,
            curveSegments: 12,
        });
        geometry.translate(0, 0, -depth / 2);
        geometry.rotateY(-Math.PI / 2);
        return geometry;
    }

    // A straight bar between two points on the car's side ([z, y] pairs), at sideways position x
    function strut(x, from, to, thickness, material) {
        const dz = to[0] - from[0];
        const dy = to[1] - from[1];
        const bar = add(new THREE.BoxGeometry(thickness, Math.hypot(dz, dy), thickness), material,
            x, (from[1] + to[1]) / 2, (from[0] + to[0]) / 2, true);
        bar.rotation.x = Math.atan2(dz, dy);
        return bar;
    }

    // ---- Body: one side profile with cut-outs for the wheel arches ----
    const WHEEL_R = 0.37;      // tire radius
    const WHEEL_Z = 1.32;      // front/rear axle position
    const ARCH_R = 0.47;       // wheel arch radius
    const BOTTOM = 0.3;        // underside of the body
    const archDx = Math.sqrt(ARCH_R * ARCH_R - (WHEEL_R - BOTTOM) * (WHEEL_R - BOTTOM));
    const archAngle = Math.asin((WHEEL_R - BOTTOM) / ARCH_R);

    add(sideProfile(s => {
        s.moveTo(-2.05, BOTTOM);
        [-WHEEL_Z, WHEEL_Z].forEach(cz => {
            s.lineTo(cz - archDx, BOTTOM);
            s.absarc(cz, WHEEL_R, ARCH_R, Math.PI + archAngle, -archAngle, true);   // arch over the wheel
        });
        s.lineTo(2.02, BOTTOM);
        s.quadraticCurveTo(2.16, BOTTOM + 0.02, 2.15, 0.5);    // front bumper
        s.lineTo(2.1, 0.7);
        s.quadraticCurveTo(2.06, 0.8, 1.85, 0.82);             // nose
        s.lineTo(0.75, 0.93);                                  // hood
        s.lineTo(-1.45, 0.95);                                 // beltline
        s.lineTo(-1.95, 0.9);                                  // trunk lid
        s.quadraticCurveTo(-2.12, 0.88, -2.14, 0.7);           // rear corner
        s.lineTo(-2.13, 0.45);
        s.quadraticCurveTo(-2.12, BOTTOM, -2.05, BOTTOM);      // rear bumper
    }, 1.8, 0.04), paint, 0, 0, 0, true);

    // Dark wheel wells, so the arches don't show daylight above the tires
    [-WHEEL_Z, WHEEL_Z].forEach(cz => add(new THREE.BoxGeometry(1.3, 0.36, 0.9), trim, 0, 0.66, cz));

    // ---- Cabin: dark glass greenhouse with a body-colored roof and pillars ----
    add(sideProfile(s => {
        s.moveTo(0.85, 0.9);
        s.lineTo(0.05, 1.36);                                  // windshield
        s.quadraticCurveTo(-0.35, 1.41, -0.78, 1.36);          // roof line
        s.lineTo(-1.55, 0.92);                                 // rear window
        s.lineTo(-1.55, 0.9);
    }, 1.52, 0.04), glass, 0, 0, 0, true);

    add(sideProfile(s => {
        s.moveTo(0.12, 1.32);
        s.lineTo(0.03, 1.39);
        s.quadraticCurveTo(-0.35, 1.45, -0.82, 1.39);
        s.lineTo(-0.86, 1.31);
        s.quadraticCurveTo(-0.35, 1.38, 0.12, 1.32);
    }, 1.56, 0.03), paint, 0, 0, 0, true);

    [-1, 1].forEach(side => {
        const x = side * 0.74;
        strut(x, [0.85, 0.9], [0.05, 1.36], 0.07, paint);                                   // A-pillar
        strut(x, [-0.78, 1.36], [-1.55, 0.92], 0.07, paint);                                // C-pillar
        add(new THREE.BoxGeometry(0.02, 0.44, 0.08), paint, side * 0.77, 1.14, -0.32, true); // B-pillar
        add(new THREE.BoxGeometry(0.22, 0.09, 0.13), paint, side * 0.88, 1.0, 0.68, true);   // side mirror
        add(new THREE.BoxGeometry(0.03, 0.08, 1.0), trim, side * 0.905, 0.35, 0);            // side skirt
    });

    // ---- Front: headlights, a thin light strip between them, and a dark air intake ----
    [-1, 1].forEach(side => add(new THREE.BoxGeometry(0.46, 0.13, 0.09), headMat, side * 0.55, 0.65, 2.11));
    add(new THREE.BoxGeometry(0.66, 0.035, 0.07), headMat, 0, 0.7, 2.1);
    add(new THREE.BoxGeometry(1.0, 0.14, 0.06), trim, 0, 0.44, 2.14);

    // ---- Rear: taillights joined by a light bar, and a dark bumper strip ----
    [-1, 1].forEach(side => add(new THREE.BoxGeometry(0.42, 0.15, 0.08), tailMat, side * 0.58, 0.72, -2.14));
    add(new THREE.BoxGeometry(0.76, 0.04, 0.07), tailMat, 0, 0.75, -2.14);
    add(new THREE.BoxGeometry(1.6, 0.1, 0.06), trim, 0, 0.4, -2.13);

    // ---- Wheels: tire, dark disc, silver rim lip, five spokes and a hub ----
    // Built around the x axis, so spinning the group with rotation.x turns it on its axle.
    function alongX(geometry) {
        geometry.rotateZ(Math.PI / 2);
        return geometry;
    }

    function makeWheel(side) {
        const wheel = new THREE.Group();
        wheel.isWheel = true;

        const tire = new THREE.Mesh(alongX(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.26, 28)), tireMat);
        tire.castShadow = true;
        wheel.add(tire);
        wheel.add(new THREE.Mesh(alongX(new THREE.CylinderGeometry(0.25, 0.25, 0.27, 20)), trim));

        const lip = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.022, 8, 24), rimMat);
        lip.rotation.y = Math.PI / 2;
        lip.position.x = side * 0.135;
        wheel.add(lip);

        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2;
            const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.06), rimMat);
            spoke.rotation.x = angle;
            spoke.position.set(side * 0.14, Math.cos(angle) * 0.11, Math.sin(angle) * 0.11);
            wheel.add(spoke);
        }

        wheel.add(new THREE.Mesh(alongX(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 12)), rimMat));
        return wheel;
    }

    [[-1, WHEEL_Z], [1, WHEEL_Z], [-1, -WHEEL_Z], [1, -WHEEL_Z]].forEach(([side, z]) => {
        const wheel = makeWheel(side);
        wheel.position.set(side * 0.79, WHEEL_R, z);
        car.add(wheel);
    });

    return car;
}

function createCar() {
    const car = buildCar();
    // The whole group bobs up and down by 0.3 (see animate), so lift the car
    // by the same amount to keep its wheels from sinking into the road
    car.position.y = 0.3;
    carGroup.add(car);
}

function createEnvironment() {
    // Ground
    const groundGeometry = new THREE.PlaneGeometry(30, 30);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,
        metalness: 0.1,
        roughness: 0.8,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    scene.add(ground);

    // Road markings
    const roadGeometry = new THREE.PlaneGeometry(25, 3);
    const roadMaterial = new THREE.MeshStandardMaterial({
        color: 0x444444,
        metalness: 0,
        roughness: 1,
    });
    const road = new THREE.Mesh(roadGeometry, roadMaterial);
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0;
    road.position.z = 0;
    scene.add(road);

    // Particles in background
    createParticles();
}

function createParticles() {
    const particleCount = 50;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
        positions[i] = (Math.random() - 0.5) * 50;
        positions[i + 1] = Math.random() * 30;
        positions[i + 2] = (Math.random() - 0.5) * 50;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
        color: 0xFF6B35,
        size: 0.2,
        opacity: 0.3,
        transparent: true,
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // Animate particles
    const positionAttribute = geometry.getAttribute('position');
    let time = 0;

    function animateParticles() {
        time += 0.001;
        const positions = positionAttribute.array;
        for (let i = 1; i < positions.length; i += 3) {
            positions[i] = Math.sin(time + i) * 5 + 10;
        }
        positionAttribute.needsUpdate = true;
        requestAnimationFrame(animateParticles);
    }

    animateParticles();
}

function createAnimatedElements() {
    // Create rotating rings around car
    const ringGeometry = new THREE.TorusGeometry(4, 0.1, 8, 100);
    const ringMaterial = new THREE.MeshStandardMaterial({
        color: 0x1FB584,
        emissive: 0x1FB584,
        emissiveIntensity: 0.5,
    });

    const ring1 = new THREE.Mesh(ringGeometry, ringMaterial);
    ring1.position.y = 1;
    ring1.rotation.x = Math.PI / 3;
    carGroup.add(ring1);

    const ring2 = new THREE.Mesh(ringGeometry, ringMaterial);
    ring2.position.y = 1;
    ring2.rotation.x = -Math.PI / 3;
    carGroup.add(ring2);

    // Floating cubes around car
    for (let i = 0; i < 4; i++) {
        const cubeGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
        const cubeMaterial = new THREE.MeshStandardMaterial({
            color: 0xFF6B35,
            emissive: 0xFF6B35,
            emissiveIntensity: 0.3,
        });
        const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
        cube.position.set(
            Math.cos((i / 4) * Math.PI * 2) * 3,
            2 + Math.sin(i) * 0.5,
            Math.sin((i / 4) * Math.PI * 2) * 3
        );
        cube.rotationIndex = i;
        carGroup.add(cube);
    }
}

function animate() {
    requestAnimationFrame(animate);

    // Rotate car
    if (carGroup) {
        carGroup.rotation.y += 0.005;

        // Spin the wheels (they can sit anywhere inside the car model)
        carGroup.traverse(child => {
            if (child.isWheel) {
                child.rotation.x += 0.1;
            }
        });

        // Floating animation
        const time = Date.now() * 0.001;
        carGroup.position.y = Math.sin(time * 0.5) * 0.3;

        // Rotate rings
        carGroup.children.forEach((child, index) => {
            if (child.geometry instanceof THREE.TorusGeometry) {
                child.rotation.x += 0.005;
                child.rotation.z += 0.008;
            }
            // Rotate and float cubes
            if (child.rotationIndex !== undefined) {
                child.rotation.x += 0.02;
                child.rotation.y += 0.03;
                const offset = Math.sin(time + child.rotationIndex) * 0.5;
                child.position.y = 2.5 + offset;
            }
        });
    }

    renderer.render(scene, camera);
}

function onWindowResize() {
    const container = document.getElementById('threejs-container');
    if (!container || !camera || !renderer) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;

    camera.aspect = width / height;
    positionCamera(camera.aspect);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

// Pull the camera back on narrow/tall screens so the whole car stays in view
function positionCamera(aspect) {
    let distance = 1;
    if (aspect < 1) distance = 1.5;
    else if (aspect < 1.4) distance = 1.2;

    camera.position.set(5 * distance, 3 * distance, 8 * distance);
    camera.lookAt(0, 0, 0);
}

// ===========================
// ANIMATED BACKGROUNDS: NIGHT DRIVE
// A site-wide layer of city lights and passing car light trails,
// plus a glowing road scene in the hero section.
// ===========================

// Colors as "r, g, b" so an alpha can be added: `rgba(${ORANGE}, 0.5)`
const ORANGE = '255, 107, 53';
const TEAL = '31, 181, 132';
const HEADLIGHT = '255, 244, 225';
const TAILLIGHT = '255, 59, 48';

// Visitors who turned on "reduce motion" get still pictures instead
const REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Runs step(dt, time) once per frame; start()/stop() pause it to save battery
function createAnimationLoop(step) {
    let frameId = null;
    let lastTime = 0;

    const loop = {
        running: false,
        start() {
            if (loop.running) return;
            loop.running = true;
            lastTime = performance.now();
            frameId = requestAnimationFrame(tick);
        },
        stop() {
            loop.running = false;
            cancelAnimationFrame(frameId);
        },
    };

    function tick(now) {
        // Cap the time step so nothing jumps after a pause
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;
        step(dt, now / 1000);
        frameId = requestAnimationFrame(tick);
    }

    return loop;
}

// Match a canvas to its on-screen size, sharp on high-density screens
function fitCanvas(canvas, ctx, width, height) {
    if (!width || !height) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
}

// ---------------------------
// Site-wide layer: soft out-of-focus city lights and long-exposure
// car light trails behind every section
// ---------------------------

function initAmbientBackground() {
    const canvas = document.getElementById('ambientBg');
    if (!canvas || !canvas.getContext) return;

    const ctx = canvas.getContext('2d');
    const hero = document.getElementById('home');
    let w = 0, h = 0;
    let cityLights = [];
    let trails = [];

    const loop = createAnimationLoop((dt, time) => {
        update(dt);
        draw(time);
    });

    function makeCityLight() {
        return {
            x: Math.random(),                   // share of the width
            y: Math.random(),                   // share of the height
            r: 15 + Math.random() * 45,
            color: Math.random() < 0.55 ? ORANGE : TEAL,
            alpha: 0.06 + Math.random() * 0.1,
            drift: (Math.random() - 0.5) * 0.01,
            depth: 0.2 + Math.random() * 0.8,   // closer lights shift more when scrolling
            phase: Math.random() * Math.PI * 2,
        };
    }

    // White headlights head right, orange taillights head left.
    // Closer trails (higher depth) are longer, faster and brighter.
    function makeTrail(initial) {
        const headlights = Math.random() < 0.5;
        const dir = headlights ? 1 : -1;
        const depth = 0.3 + Math.random() * 0.7;
        const offscreen = Math.random() * w * 0.5;   // stagger arrivals
        return {
            color: headlights ? HEADLIGHT : ORANGE,
            dir,
            depth,
            y: Math.random(),
            x: initial ? Math.random() * w : (dir > 0 ? -offscreen : w + offscreen),
            length: 80 + depth * 220,
            speed: 60 + depth * 240,            // pixels per second
            width: 0.6 + depth * 1.4,
            alpha: 0.12 + depth * 0.25,
        };
    }

    // Place an item on screen, shifted by page scroll for a parallax effect
    function parallaxY(share, depth, margin) {
        const span = h + margin * 2;
        const y = share * span - window.scrollY * depth * 0.25;
        return ((y % span) + span) % span - margin;
    }

    function resize() {
        w = canvas.clientWidth;
        h = canvas.clientHeight;
        if (!fitCanvas(canvas, ctx, w, h)) return;

        // Fewer moving parts on phones
        const small = w < 768;
        const lightCount = small ? 12 : 22;
        const trailCount = small ? 4 : 7;
        if (cityLights.length !== lightCount) {
            cityLights = Array.from({ length: lightCount }, makeCityLight);
        }
        if (trails.length !== trailCount) {
            trails = Array.from({ length: trailCount }, () => makeTrail(true));
        }

        if (!loop.running) draw(0);
    }

    function drawCityLights(time) {
        cityLights.forEach(l => {
            const x = l.x * w;
            const y = parallaxY(l.y, l.depth, l.r);
            const a = l.alpha * (0.6 + 0.4 * Math.sin(time * 0.8 + l.phase));
            const g = ctx.createRadialGradient(x, y, 0, x, y, l.r);
            g.addColorStop(0, `rgba(${l.color}, ${a})`);
            g.addColorStop(0.7, `rgba(${l.color}, ${a * 0.8})`);
            g.addColorStop(1, `rgba(${l.color}, 0)`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, l.r, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    function drawTrails() {
        ctx.lineCap = 'round';
        trails.forEach(t => {
            const y = parallaxY(t.y, t.depth, 20);
            const gap = 2 + t.depth * 4;        // two lights per car
            const tailX = t.x - t.dir * t.length;

            [y, y + gap].forEach(ly => {
                const g = ctx.createLinearGradient(t.x, ly, tailX, ly);
                g.addColorStop(0, `rgba(${t.color}, ${t.alpha})`);
                g.addColorStop(1, `rgba(${t.color}, 0)`);
                ctx.strokeStyle = g;
                ctx.lineWidth = t.width;
                ctx.beginPath();
                ctx.moveTo(t.x, ly);
                ctx.lineTo(tailX, ly);
                ctx.stroke();
            });

            // Soft glow around the front of the lights
            ctx.fillStyle = `rgba(${t.color}, ${t.alpha * 0.25})`;
            ctx.beginPath();
            ctx.arc(t.x, y + gap / 2, t.width * 5, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    // The home section has its own cars on the road, so erase the horizontal
    // trails over it; otherwise they cut across the road's traffic.
    // Trails fade back in just below the home section.
    function clearTrailsOverHero() {
        if (!hero) return;
        const bottom = hero.getBoundingClientRect().bottom;
        if (bottom <= 0) return; // home section scrolled out of view

        const FADE = 80;
        const fade = ctx.createLinearGradient(0, bottom, 0, bottom + FADE);
        fade.addColorStop(0, 'rgba(0, 0, 0, 1)');
        fade.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, bottom);
        ctx.fillStyle = fade;
        ctx.fillRect(0, bottom, w, FADE);
    }

    function draw(time) {
        ctx.clearRect(0, 0, w, h);

        ctx.globalCompositeOperation = 'lighter';
        drawTrails();
        clearTrailsOverHero();

        // City lights go on after the erase, so they still glow everywhere
        ctx.globalCompositeOperation = 'lighter';
        drawCityLights(time);
        ctx.globalCompositeOperation = 'source-over';
    }

    function update(dt) {
        cityLights.forEach(l => {
            l.x += l.drift * dt;
            if (l.x < -0.1) l.x = 1.1;
            else if (l.x > 1.1) l.x = -0.1;
        });

        trails.forEach((t, i) => {
            t.x += t.dir * t.speed * dt;
            const tailX = t.x - t.dir * t.length;
            if ((t.dir > 0 && tailX > w) || (t.dir < 0 && tailX < 0)) {
                trails[i] = makeTrail(false);
            }
        });
    }

    resize();

    if ('ResizeObserver' in window) {
        new ResizeObserver(resize).observe(canvas);
    } else {
        window.addEventListener('resize', debounce(resize, 250));
    }

    // Pause while the tab is in the background
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) loop.stop();
        else if (!REDUCE_MOTION) loop.start();
    });

    if (!REDUCE_MOTION) loop.start();
}

// ---------------------------
// Hero layer: a glowing road rolling toward the viewer, with
// cars driving away (taillights) and toward you (headlights)
// ---------------------------

function initHeroBackground() {
    const canvas = document.getElementById('heroBg');
    const hero = document.getElementById('home');
    if (!canvas || !hero || !canvas.getContext) return;

    const ctx = canvas.getContext('2d');

    const Z_FAR = 28;   // how far into the distance the road is drawn
    const SPEED = 3;    // driving speed (road units per second)

    let w = 0, h = 0, horizon = 0, floorH = 0, vpX = 0;
    let gridGradient, edgeGradient;
    let travel = 0;
    let cars = [];
    let onScreen = true;

    const loop = createAnimationLoop(dt => {
        update(dt);
        draw();
    });

    // Turn a point on the road (x = across, z = distance ahead) into screen coordinates
    function project(x, z) {
        const scale = floorH / z;
        return { x: vpX + x * scale, y: horizon + scale, scale };
    }

    // Same as project(), for a point at height y above the road.
    // The camera sits 1 unit above the road, so higher points sit closer to the horizon.
    function project3(x, y, z) {
        const scale = floorH / z;
        return { x: vpX + x * scale, y: horizon + (1 - y) * scale };
    }

    // ---- Cars ----
    // Sizes are in road units: each lane is 1 unit wide.
    const NEAR = 0.3;        // closest distance that gets drawn
    const CAR_W = 0.46;      // car width
    const CAR_GAP = 1.4;     // minimum space between cars in the same lane
    const PAINT = ['#56627f', '#7a4a58', '#3d6b6c', '#776b55', '#4f5668', '#8a909e'];
    const GLASS = '#1c2540';
    const GLASS_SIDE = '#141b30';

    // Lighten (factor > 1) or darken (factor < 1) a hex color
    function shade(hex, factor) {
        const n = parseInt(hex.slice(1), 16);
        const c = v => Math.min(255, Math.round(v * factor));
        return `rgb(${c(n >> 16)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
    }

    // Cars ahead (red taillights) pull away in the right lane;
    // oncoming cars (white headlights) come toward you in the left lane.
    // z is the distance to the end of the car facing the viewer.
    function makeCar(oncoming, z) {
        const paint = PAINT[Math.floor(Math.random() * PAINT.length)];
        return {
            oncoming,
            lane: oncoming ? -0.5 : 0.5,
            z,
            length: 1.1 + Math.random() * 0.3,
            speed: oncoming ? 6 + Math.random() * 4 : 1 + Math.random() * 2,
            paint: { near: paint, top: shade(paint, 1.3), side: shade(paint, 0.7) },
        };
    }

    // A new car joins at the back of the line for its direction,
    // so it never appears on top of another car
    function spawnCar(replacing) {
        const oncoming = Math.random() < 0.5;
        const sameWay = cars.filter(c => c !== replacing && c.oncoming === oncoming);

        if (oncoming) {
            // Appears out of the distance, behind any oncoming cars already there
            const last = sameWay.reduce((far, c) => Math.max(far, c.z + c.length), -Infinity);
            return makeCar(true, Math.max(Z_FAR, last + CAR_GAP));
        }

        // Comes up from behind the viewer, behind any cars already pulling away
        const car = makeCar(false, 0);
        const last = sameWay.reduce((near, c) => Math.min(near, c.z), Infinity);
        car.z = Math.min(-car.length - 0.5, last - car.length - CAR_GAP);
        return car;
    }

    // Cars in the same lane keep a safe gap instead of driving through
    // each other: a faster car slows to the speed of the car in front
    function keepDistance() {
        const ahead = cars.filter(c => !c.oncoming).sort((a, b) => b.z - a.z);
        for (let i = 1; i < ahead.length; i++) {
            const front = ahead[i - 1], car = ahead[i];
            const limit = front.z - car.length - CAR_GAP;
            if (car.z > limit) {
                car.z = limit;
                car.speed = Math.min(car.speed, front.speed);
            }
        }

        const oncoming = cars.filter(c => c.oncoming).sort((a, b) => a.z - b.z);
        for (let i = 1; i < oncoming.length; i++) {
            const front = oncoming[i - 1], car = oncoming[i];
            const limit = front.z + front.length + CAR_GAP;
            if (car.z < limit) {
                car.z = limit;
                car.speed = Math.min(car.speed, front.speed);
            }
        }
    }

    function resize() {
        w = hero.clientWidth;
        h = hero.clientHeight;
        if (!fitCanvas(canvas, ctx, w, h)) return;

        // Desktop: the road sits on the right, beside the text.
        // Tablet/phone: the text is centered, so the road is centered too.
        const stacked = w <= 1024;
        horizon = h * (stacked ? 0.66 : 0.6);
        floorH = h - horizon;
        vpX = w * (stacked ? 0.5 : 0.72);

        gridGradient = ctx.createLinearGradient(0, horizon, 0, h);
        gridGradient.addColorStop(0, `rgba(${TEAL}, 0)`);
        gridGradient.addColorStop(0.25, `rgba(${TEAL}, 0.08)`);
        gridGradient.addColorStop(1, `rgba(${TEAL}, 0.28)`);

        edgeGradient = ctx.createLinearGradient(0, horizon, 0, h);
        edgeGradient.addColorStop(0, `rgba(${ORANGE}, 0)`);
        edgeGradient.addColorStop(0.2, `rgba(${ORANGE}, 0.35)`);
        edgeGradient.addColorStop(1, `rgba(${ORANGE}, 0.8)`);

        // Fewer cars on phones
        const carCount = w < 768 ? 3 : 5;
        if (!cars.length) {
            // First load: start with traffic already on the road in both directions
            for (let i = 0; i < carCount; i++) {
                const oncoming = i % 2 === 1;
                const z = oncoming ? 5 + Math.random() * 18 : 1.5 + Math.random() * 10;
                cars.push(makeCar(oncoming, z));
            }
            keepDistance();
        }
        while (cars.length < carCount) cars.push(spawnCar());
        cars.length = carCount;

        if (!loop.running) draw();
    }

    function drawHorizonGlow() {
        // Warm skyline glow around the vanishing point
        const r = Math.max(w, h) * 0.6;
        ctx.save();
        ctx.translate(vpX, horizon);
        ctx.scale(1, 0.3);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, `rgba(${ORANGE}, 0.25)`);
        g.addColorStop(0.35, `rgba(${ORANGE}, 0.08)`);
        g.addColorStop(1, `rgba(${ORANGE}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.restore();

        // Thin horizon line, brightest at the vanishing point
        const line = ctx.createLinearGradient(vpX - w * 0.6, 0, vpX + w * 0.6, 0);
        line.addColorStop(0, `rgba(${TEAL}, 0)`);
        line.addColorStop(0.5, `rgba(${TEAL}, 0.45)`);
        line.addColorStop(1, `rgba(${TEAL}, 0)`);
        ctx.strokeStyle = line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(vpX - w * 0.6, horizon);
        ctx.lineTo(vpX + w * 0.6, horizon);
        ctx.stroke();
    }

    function drawGrid() {
        ctx.strokeStyle = gridGradient;
        ctx.lineWidth = 1;
        ctx.beginPath();

        // Cross lines rolling toward the viewer
        const offset = travel % 1;
        for (let i = 0; i <= Z_FAR; i++) {
            const z = i + 1 - offset;
            if (z < 0.5) continue;
            const y = horizon + floorH / z;
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
        }

        // Lines running into the distance on both sides of the road
        for (let k = 2; k <= 14; k++) {
            [k, -k].forEach(x => {
                const far = project(x, Z_FAR);
                const near = project(x, 0.3);
                ctx.moveTo(far.x, far.y);
                ctx.lineTo(near.x, near.y);
            });
        }
        ctx.stroke();
    }

    function drawRoad() {
        const farL = project(-1, Z_FAR), farR = project(1, Z_FAR);
        const nearL = project(-1, 0.3), nearR = project(1, 0.3);

        // Dark road surface (covers the grid)
        ctx.fillStyle = 'rgba(10, 14, 39, 0.85)';
        ctx.beginPath();
        ctx.moveTo(farL.x, farL.y);
        ctx.lineTo(farR.x, farR.y);
        ctx.lineTo(nearR.x, nearR.y);
        ctx.lineTo(nearL.x, nearL.y);
        ctx.closePath();
        ctx.fill();

        // Glowing road edges
        ctx.strokeStyle = edgeGradient;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(farL.x, farL.y);
        ctx.lineTo(nearL.x, nearL.y);
        ctx.moveTo(farR.x, farR.y);
        ctx.lineTo(nearR.x, nearR.y);
        ctx.stroke();

        // Dashed center line rolling toward the viewer
        const period = 1.5, dash = 0.6, half = 0.02;
        const offset = travel % period;
        for (let i = 0; i * period < Z_FAR; i++) {
            const start = i * period - offset;
            const z0 = Math.max(start, 0.3);
            const z1 = start + dash;
            if (z1 <= z0) continue;
            const a = project(-half, z0), b = project(half, z0);
            const c = project(half, z1), d = project(-half, z1);
            ctx.fillStyle = `rgba(${HEADLIGHT}, ${0.4 * (1 - z0 / Z_FAR)})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.lineTo(c.x, c.y);
            ctx.lineTo(d.x, d.y);
            ctx.closePath();
            ctx.fill();
        }
    }

    function fillPoly(points, style) {
        ctx.fillStyle = style;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        ctx.closePath();
        ctx.fill();
    }

    // Draw the faces of a box that the viewer can see: the side facing
    // the middle of the road, the top, and the end facing the viewer
    function drawBox(x0, x1, y0, y1, z0, z1, colors) {
        if (z1 <= NEAR) return;
        const zn = Math.max(z0, NEAR);
        const p = project3;

        const sideX = x0 > 0 ? x0 : (x1 < 0 ? x1 : null);
        if (sideX !== null) {
            fillPoly([p(sideX, y0, zn), p(sideX, y1, zn), p(sideX, y1, z1), p(sideX, y0, z1)], colors.side);
        }
        fillPoly([p(x0, y1, zn), p(x1, y1, zn), p(x1, y1, z1), p(x0, y1, z1)], colors.top);
        if (z0 >= NEAR) {
            fillPoly([p(x0, y0, z0), p(x1, y0, z0), p(x1, y1, z0), p(x0, y1, z0)], colors.near);
        }
    }

    // A head- or taillight: a soft halo that adds light, then a solid core
    // painted normally so taillights stay red even on light-colored cars
    function drawLamp(x, y, z, color) {
        const s = project3(x, y, z);
        const r = Math.max(0.7, 0.028 * floorH / z);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(${color}, 0.18)`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r * 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = `rgba(${color}, 0.95)`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Soft pool of light on the road between a car and the viewer
    function drawLightPool(car, color, reach, spread, alpha) {
        if (car.z <= NEAR) return;
        const zEnd = Math.max(car.z - reach, NEAR);
        const a = project3(car.lane - CAR_W * 0.4, 0, car.z);
        const b = project3(car.lane + CAR_W * 0.4, 0, car.z);
        const c = project3(car.lane + spread, 0, zEnd);
        const d = project3(car.lane - spread, 0, zEnd);
        const g = ctx.createLinearGradient(0, a.y, 0, c.y);
        g.addColorStop(0, `rgba(${color}, ${alpha})`);
        g.addColorStop(1, `rgba(${color}, 0)`);
        fillPoly([a, b, c, d], g);
    }

    function drawCar(car) {
        const zBack = car.z + car.length;   // far end of the car
        if (zBack <= NEAR || car.z >= Z_FAR) return;
        // Fade in/out near the horizon, and again right in front of the viewer
        // so close cars don't fill the bottom of the screen as big blocks
        const farFade = Math.min(1, (Z_FAR - car.z) / 6);
        const nearFade = Math.min(1, Math.max(0, (car.z - 0.5) / 1.2));
        if (nearFade === 0) return;

        const x0 = car.lane - CAR_W / 2;
        const x1 = car.lane + CAR_W / 2;
        ctx.globalAlpha = farFade * nearFade;

        // Shadow under the car
        const zs = Math.max(car.z - 0.04, NEAR);
        fillPoly([
            project3(x0 - 0.04, 0, zs), project3(x1 + 0.04, 0, zs),
            project3(x1 + 0.04, 0, zBack + 0.06), project3(x0 - 0.04, 0, zBack + 0.06),
        ], 'rgba(0, 0, 0, 0.45)');

        // Light on the road: headlight beams in front of oncoming cars,
        // a faint red glow behind the cars ahead
        ctx.globalCompositeOperation = 'lighter';
        if (car.oncoming) drawLightPool(car, HEADLIGHT, 2.4, 0.42, 0.16);
        else drawLightPool(car, TAILLIGHT, 0.7, 0.3, 0.1);
        ctx.globalCompositeOperation = 'source-over';

        // Body, then the cabin with its windows. The cabin sits behind the
        // hood on oncoming cars, and in front of the trunk on cars ahead.
        drawBox(x0, x1, 0.05, 0.24, car.z, zBack, car.paint);
        const cabinStart = car.z + car.length * (car.oncoming ? 0.36 : 0.2);
        drawBox(x0 + 0.03, x1 - 0.03, 0.24, 0.4, cabinStart, cabinStart + car.length * 0.44,
            { near: GLASS, side: GLASS_SIDE, top: car.paint.top });

        // Headlights or taillights on the end facing the viewer
        if (car.z >= NEAR) {
            const color = car.oncoming ? HEADLIGHT : TAILLIGHT;
            const y = car.oncoming ? 0.15 : 0.17;
            drawLamp(x0 + 0.07, y, car.z, color);
            drawLamp(x1 - 0.07, y, car.z, color);
        }

        ctx.globalAlpha = 1;
    }

    function drawCars() {
        // Farthest first, so nearer cars are drawn on top
        cars.slice().sort((a, b) => b.z - a.z).forEach(drawCar);
    }

    // Fade the bottom edge so the scene blends into the next section
    function fadeBottom() {
        const top = h * 0.82;
        const g = ctx.createLinearGradient(0, top, 0, h);
        g.addColorStop(0, 'rgba(0, 0, 0, 0)');
        g.addColorStop(1, 'rgba(0, 0, 0, 1)');
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = g;
        ctx.fillRect(0, top, w, h - top);
        ctx.globalCompositeOperation = 'source-over';
    }

    function draw() {
        ctx.clearRect(0, 0, w, h);
        drawHorizonGlow();
        drawGrid();
        drawRoad();
        drawCars();
        fadeBottom();
    }

    function update(dt) {
        travel += SPEED * dt;

        cars.forEach(car => {
            car.z += (car.oncoming ? -car.speed : car.speed) * dt;
        });
        keepDistance();

        // Replace cars that have fully driven out of view
        cars.forEach((car, i) => {
            const gone = car.oncoming ? car.z + car.length < NEAR : car.z > Z_FAR;
            if (gone) cars[i] = spawnCar(car);
        });
    }

    function start() {
        if (REDUCE_MOTION || !onScreen || document.hidden) return;
        loop.start();
    }

    function stop() {
        loop.stop();
    }

    resize();

    if ('ResizeObserver' in window) {
        new ResizeObserver(resize).observe(hero);
    } else {
        window.addEventListener('resize', debounce(resize, 250));
    }

    // Only animate while the home section is on screen and the tab is visible (saves battery)
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(([entry]) => {
            onScreen = entry.isIntersecting;
            if (onScreen) start();
            else stop();
        }).observe(hero);
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stop();
        else start();
    });

    start();
}

// ===========================
// CHAT FUNCTIONALITY
// ===========================

const chatResponses = {
    appointment: {
        text: "I'd be happy to help you book an appointment! What type of service do you need? (e.g., maintenance, repair, inspection, tire change)",
        delay: 500,
    },
    maintenance: {
        text: "Regular maintenance is key to keeping your vehicle in top condition. Common services include: oil changes, filter replacements, fluid checks, tire rotation, and brake inspections. What specific maintenance help do you need?",
        delay: 800,
    },
    diagnostic: {
        text: "I can help with vehicle diagnostics. Are you experiencing any warning lights, unusual sounds, or performance issues? Please describe what you're noticing, and I'll provide recommendations.",
        delay: 700,
    },
    info: {
        text: "What vehicle information would you like? I can help with specifications, features, how to use certain systems, or general vehicle care tips.",
        delay: 600,
    },
    default: {
        text: "Thank you for your inquiry. Could you please provide more details so I can better assist you? You can also select one of the quick action buttons below.",
        delay: 500,
    },
};

function handleAction(action) {
    const response = chatResponses[action] || chatResponses.default;
    addMessage(`I need help with ${action}`, 'user');

    setTimeout(() => {
        addMessage(response.text, 'bot');
    }, response.delay);
}

function sendMessage() {
    const input = document.getElementById('userInput');
    const message = input.value.trim();

    if (!message) return;

    addMessage(message, 'user');
    input.value = '';

    // Simulate AI response
    setTimeout(() => {
        const responses = [
            "That's a great question! Let me help you with that.",
            "I understand. Here are some recommendations for you...",
            "Absolutely! I'm here to assist you with that.",
            "Thank you for reaching out. I can definitely help with that.",
            "Perfect! Let me provide you with some expert guidance.",
        ];

        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        addMessage(randomResponse, 'bot');
    }, 800);
}

function addMessage(text, sender) {
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', `${sender}-message`);

    const p = document.createElement('p');
    p.textContent = text;
    messageDiv.appendChild(p);

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ===========================
// FORM HANDLING
// ===========================

function handleFormSubmit(event) {
    event.preventDefault();

    const formData = {
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        subject: document.getElementById('subject').value,
        message: document.getElementById('message').value,
    };

    console.log('Form submitted:', formData);

    // Show success message
    alert(`Thank you, ${formData.name}! Your message has been sent. We'll get back to you soon at ${formData.email}.`);

    // Reset form
    event.target.reset();
}

// ===========================
// SMOOTH SCROLLING
// ===========================

function scrollToSection(selector) {
    const element = document.querySelector(selector);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
    }
}

// ===========================
// MOBILE NAVIGATION
// ===========================

document.addEventListener('DOMContentLoaded', () => {
    const hamburger = document.querySelector('.hamburger');
    const navLinks = document.querySelector('.nav-links');

    if (hamburger && navLinks) {
        const setMenuOpen = (open) => {
            navLinks.classList.toggle('active', open);
            hamburger.classList.toggle('active', open);
            hamburger.setAttribute('aria-expanded', String(open));
            hamburger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        };

        hamburger.addEventListener('click', (e) => {
            e.stopPropagation();
            setMenuOpen(!navLinks.classList.contains('active'));
        });

        // Close menu when a link is tapped
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => setMenuOpen(false));
        });

        // Close menu when tapping anywhere outside it
        document.addEventListener('click', (e) => {
            if (!navLinks.contains(e.target)) setMenuOpen(false);
        });

        // Close menu with the Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') setMenuOpen(false);
        });

        // Reset the menu when the screen grows back to desktop size
        window.matchMedia('(min-width: 769px)').addEventListener('change', (e) => {
            if (e.matches) setMenuOpen(false);
        });
    }

    // Initialize the animated backgrounds and the Three.js scene
    initAmbientBackground();
    initHeroBackground();
    initThreeJS();

    // Prevent Enter key from scrolling in chat input
    const chatInput = document.getElementById('userInput');
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    // Add scroll animations
    observeElements();
});

// ===========================
// INTERSECTION OBSERVER FOR ANIMATIONS
// ===========================

function observeElements() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px',
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.animation = 'slideInUp 0.8s ease-out forwards';
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('section').forEach(section => {
        observer.observe(section);
    });
}

// ===========================
// UTILITIES
// ===========================

// Debounce function for window resize
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Prevent default behavior for chat buttons
// (the contact form's submit button is left alone so the form can submit)
document.addEventListener('DOMContentLoaded', () => {
    const buttons = document.querySelectorAll('.action-btn, .send-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', function(e) {
            // Prevent default only if it's not a link
            if (!this.href) {
                e.preventDefault();
            }
        });
    });
});