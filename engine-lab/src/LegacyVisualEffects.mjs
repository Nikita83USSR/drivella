import {
  Color3,
  DefaultRenderingPipeline,
  MaterialPluginBase,
  ShaderLanguage,
  DynamicTexture,
  LensFlare,
  LensFlareSystem,
  Mesh,
  MeshBuilder,
  PointLight,
  Scene,
  ShadowGenerator,
  SSAORenderingPipeline,
  SSRRenderingPipeline,
  SpotLight,
  StandardMaterial,
  Texture,
  Vector3,
  VolumetricLightScatteringPostProcess
} from "@babylonjs/core";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

class RoadHeadlightMaterialPlugin extends MaterialPluginBase {
  constructor(material, getState) {
    super(material, "DrivellaRoadHeadlights", 150, { DRIVELLA_ROAD_HEADLIGHTS: false });
    this.getState = getState;
    this.bindCount = 0;
    this.lastBound = { intensity: 0, directionY: 0 };
    this._enable(true);
  }

  getClassName() {
    return "RoadHeadlightMaterialPlugin";
  }

  isCompatible(shaderLanguage) {
    return shaderLanguage === ShaderLanguage.GLSL;
  }

  prepareDefines(defines) {
    defines.DRIVELLA_ROAD_HEADLIGHTS = true;
  }

  getUniforms() {
    return {
      ubo: [
        { name: "drivellaRoadHeadlightPositionL", size: 3, type: "vec3" },
        { name: "drivellaRoadHeadlightPositionR", size: 3, type: "vec3" },
        { name: "drivellaRoadHeadlightDirection", size: 3, type: "vec3" },
        { name: "drivellaRoadHeadlightIntensity", size: 1, type: "float" }
      ],
      fragment: `
#ifdef DRIVELLA_ROAD_HEADLIGHTS
uniform vec3 drivellaRoadHeadlightPositionL;
uniform vec3 drivellaRoadHeadlightPositionR;
uniform vec3 drivellaRoadHeadlightDirection;
uniform float drivellaRoadHeadlightIntensity;
#endif
`
    };
  }

  bindForSubMesh(uniformBuffer) {
    const state = this.getState?.() ?? {};
    const positionL = state.positionL ?? Vector3.Zero();
    const positionR = state.positionR ?? Vector3.Zero();
    const direction = state.direction ?? new Vector3(0, 0, 1);
    const intensity = Math.max(0, Number(state.intensity) || 0);
    uniformBuffer.updateVector3("drivellaRoadHeadlightPositionL", positionL);
    uniformBuffer.updateVector3("drivellaRoadHeadlightPositionR", positionR);
    uniformBuffer.updateVector3("drivellaRoadHeadlightDirection", direction);
    uniformBuffer.updateFloat("drivellaRoadHeadlightIntensity", intensity);
    this.bindCount += 1;
    this.lastBound = {
      intensity,
      directionY: Number(direction.y.toFixed(4)),
      positionL: positionL.clone(),
      positionR: positionR.clone()
    };
  }

  getCustomCode(shaderType, shaderLanguage) {
    if (shaderType !== "fragment" || shaderLanguage !== ShaderLanguage.GLSL) return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
#ifdef DRIVELLA_ROAD_HEADLIGHTS
float drivellaRoadHeadlightEnergy(vec3 surfaceNormal) {
  if (drivellaRoadHeadlightIntensity <= 0.001) return 0.0;
  vec3 beamDirection = normalize(drivellaRoadHeadlightDirection);
  vec3 deltaL = drivellaRoadHeadlightPositionL - vPositionW;
  vec3 deltaR = drivellaRoadHeadlightPositionR - vPositionW;
  float distSqL = dot(deltaL, deltaL);
  float distSqR = dot(deltaR, deltaR);
  float energy = 0.0;
  if (distSqL < 10000.0) {
    float distL = sqrt(max(distSqL, 0.000001));
    vec3 toL = deltaL / max(distL, 0.001);
    float coneL = smoothstep(0.60, 0.94, dot(beamDirection, -toL));
    float rangeL = 1.0 - smoothstep(28.0, 100.0, distL);
    float attenuationL = 1.0 / (1.0 + distSqL * 0.0018);
    float diffuseL = clamp(abs(dot(normalize(surfaceNormal), toL)) * 0.72 + 0.10, 0.0, 0.82);
    energy += coneL * rangeL * attenuationL * diffuseL;
  }
  if (distSqR < 10000.0) {
    float distR = sqrt(max(distSqR, 0.000001));
    vec3 toR = deltaR / max(distR, 0.001);
    float coneR = smoothstep(0.60, 0.94, dot(beamDirection, -toR));
    float rangeR = 1.0 - smoothstep(28.0, 100.0, distR);
    float attenuationR = 1.0 / (1.0 + distSqR * 0.0018);
    float diffuseR = clamp(abs(dot(normalize(surfaceNormal), toR)) * 0.72 + 0.10, 0.0, 0.82);
    energy += coneR * rangeR * attenuationR * diffuseR;
  }
  return energy * drivellaRoadHeadlightIntensity;
}
#endif
`,
      CUSTOM_FRAGMENT_BEFORE_FOG: `
#ifdef DRIVELLA_ROAD_HEADLIGHTS
color.rgb += vec3(0.58, 0.78, 1.0) * (drivellaRoadHeadlightEnergy(normalW) * 0.46);
#endif
`
    };
  }
}

function makeLensFlarePngUrl() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable for lens flare texture");
  ctx.clearRect(0, 0, 256, 256);
  const flare = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  // A tiny hot core with a very light, wide feather. The old profile kept
  // near-full opacity across the centre and read as a solid pink disc.
  flare.addColorStop(0.000, "rgba(255,255,255,0.96)");
  flare.addColorStop(0.018, "rgba(255,249,239,0.56)");
  flare.addColorStop(0.055, "rgba(255,220,207,0.22)");
  flare.addColorStop(0.120, "rgba(255,166,177,0.075)");
  flare.addColorStop(0.235, "rgba(255,116,157,0.024)");
  flare.addColorStop(0.420, "rgba(130,92,190,0.008)");
  flare.addColorStop(0.680, "rgba(34,116,255,0.002)");
  flare.addColorStop(1.000, "rgba(0,0,0,0)");
  ctx.fillStyle = flare;
  ctx.fillRect(0, 0, 256, 256);
  return canvas.toDataURL("image/png");
}

function makeHorizonSunTexture(scene) {
  const texture = new DynamicTexture(
    "drivella-horizon-sun-texture",
    { width: 1024, height: 1024 },
    scene,
    true,
    Texture.TRILINEAR_SAMPLINGMODE
  );
  texture.hasAlpha = true;
  const ctx = texture.getContext();
  const draw = (time = 0) => {
    const size = 1024;
    const center = 512;
    const radius = 292;
    ctx.clearRect(0, 0, size, size);

    const aura = ctx.createRadialGradient(center, center, radius * 0.36, center, center, 430);
    aura.addColorStop(0, "rgba(255,76,45,0.44)");
    aura.addColorStop(0.30, "rgba(255,54,70,0.26)");
    aura.addColorStop(0.66, "rgba(205,34,112,0.11)");
    aura.addColorStop(0.88, "rgba(120,20,88,0.035)");
    aura.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.clip();
    const disc = ctx.createLinearGradient(0, center - radius, 0, center + radius);
    disc.addColorStop(0, "#ff9957");
    disc.addColorStop(0.29, "#ff593d");
    disc.addColorStop(0.66, "#ef2f69");
    disc.addColorStop(1, "#a82b80");
    ctx.fillStyle = disc;
    ctx.fillRect(center - radius, center - radius, radius * 2, radius * 2);

    const slices = [
      [-0.66, 0.024], [-0.50, 0.027], [-0.35, 0.032],
      [-0.20, 0.041], [-0.04, 0.053], [0.13, 0.066],
      [0.32, 0.084], [0.54, 0.108], [0.78, 0.13]
    ];
    for (let index = 0; index < slices.length; index += 1) {
      const [offset, thickness] = slices[index];
      ctx.fillStyle = index < 3 ? "rgba(75,13,64,0.48)" : "rgba(42,10,57,0.65)";
      ctx.fillRect(center - radius - 4, center + radius * offset, radius * 2 + 8, radius * thickness);
    }
    ctx.fillStyle = "rgba(255,201,156,0.26)";
    ctx.fillRect(center - radius * 0.84, center + radius * 0.04, radius * 1.68, 3);
    ctx.fillRect(center - radius * 0.68, center + radius * 0.48, radius * 1.36, 3);

    const scanY = center - radius + ((time * 0.000055) % 1) * radius * 2;
    const scan = ctx.createLinearGradient(0, scanY - 12, 0, scanY + 12);
    scan.addColorStop(0, "rgba(255,220,180,0)");
    scan.addColorStop(0.5, "rgba(255,211,172,0.24)");
    scan.addColorStop(1, "rgba(255,220,180,0)");
    ctx.fillStyle = scan;
    ctx.fillRect(center - radius, scanY - 12, radius * 2, 24);
    ctx.restore();

    ctx.strokeStyle = "rgba(255,180,140,0.48)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center, center, radius - 1, 0, Math.PI * 2);
    ctx.stroke();
    texture.update();
  };
  draw(0);
  return { texture, draw };
}

export class LegacyVisualEffects {
  constructor(scene, engine, camera, sunLight, { glowLayer = null, roadSamples = [], roadMaterial = null } = {}) {
    this.scene = scene;
    this.engine = engine;
    this.camera = camera;
    this.sunLight = sunLight;
    this.glowLayer = glowLayer;
    this.roadSamples = roadSamples;
    this.ready = true;
    this.errors = [];
    this.shadowReceivers = new Set();
    this.headlightsEnabled = false;
    this.headlightsDeployed = false;
    this.underglowEnabled = true;
    this.lensFlaresEnabled = true;
    this.outlinesEnabled = true;
    this.outlineMeshes = new Set();
    this.tailMaterial = null;
    this.sunEnabled = true;
    this.atmosphereEnabled = true;
    this.lastSunTextureUpdate = 0;
    this.vehicle = null;
    this.wheelShadows = new Map();
    this.headlampSpots = [];
    this.headlampSpotBySide = new Map();
    this.headlampGlowMeshes = [];
    this.headlightRoadPower = 0;
    this.headlightRoadPlugin = null;
    this.headlightRoadBindObserver = null;
    this.headlightRoadObservableBindCount = 0;
    this.headlightRoadMaterial = roadMaterial ?? null;
    if (roadMaterial) {
      try {
        this.headlightRoadPlugin = new RoadHeadlightMaterialPlugin(roadMaterial, () => this.getRoadHeadlightUniforms());
        // StandardMaterial calls onBindObservable for each road submesh after
        // binding its UBO. Some frozen/unchanged-material paths skip the plugin
        // bind callback, so upload our live UBO values here before ubo.update().
        this.headlightRoadBindObserver = roadMaterial.onBindObservable.add(() => {
          const uniformBuffer = roadMaterial._uniformBuffer;
          if (!uniformBuffer || !this.headlightRoadPlugin) return;
          this.headlightRoadPlugin.bindForSubMesh(uniformBuffer);
          this.headlightRoadObservableBindCount += 1;
        });
      } catch (error) {
        this.recordError("road headlight material plugin", error);
      }
    }
    this.underbodyLights = [];
    this.trackLights = [];
    this.pipeline = null;
    this.ssao = null;
    this.ssaoAttached = false;
    this.ssr = null;
    this.vls = null;
    this.sunMesh = null;
    this.sunMaterial = null;
    this.sunTexture = null;
    this.sunTextureDraw = null;
    this.shadowGenerator = null;
    this.sunFlareSystem = null;
    this.lensFlareSystems = [];
    this.flareTextureUrl = null;
    this.flareTextureKind = "unavailable";
    this.vlsAttached = false;

    this.createAtmosphere();
    this.createHorizonSun();
    this.createShadowSystem();
    this.createPostProcessing();
    this.createSunRays();
    this.createLensFlares();
    this.createTrackLights();
    this.scene.onNewMeshAddedObservable.add((mesh) => this.registerShadowReceiver(mesh));
    this.scene.onMeshRemovedObservable.add((mesh) => {
      if (!this.shadowReceivers.delete(mesh)) return;
      this.shadowGenerator?.removeShadowCaster(mesh);
    });
    this.scene.meshes.slice().forEach((mesh) => this.registerShadowReceiver(mesh));
    this.ready = true;
  }

  recordError(name, error) {
    const message = String(error?.message ?? error);
    this.errors.push(name + ": " + message);
    console.warn("DRIVELLA legacy FX " + name + " unavailable:", error);
  }

  createAtmosphere() {
    // Subtle night-blue aerial perspective: distant mountains and horizon
    // fade into the sky instead of ending at a hard geometry cutoff.
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogColor = new Color3(0.045, 0.055, 0.14);
    this.scene.fogDensity = 0.00112;
    this.scene.fogEnabled = true;
    this.atmosphereEnabled = true;
  }

  createHorizonSun() {
    try {
      const { texture, draw } = makeHorizonSunTexture(this.scene);
      this.sunTexture = texture;
      this.sunTextureDraw = draw;
      const mesh = MeshBuilder.CreatePlane("drivella-horizon-sunset-disc", { size: 680 }, this.scene);
      mesh.parent = this.camera;
      mesh.position.set(0, 38, 820);
      mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
      mesh.isPickable = false;
      mesh.isBlocker = false;
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.renderingGroupId = 0;
      mesh.applyFog = false;
      mesh.metadata = { ...(mesh.metadata ?? {}), isFX: true, noShadowCaster: true };
      const material = new StandardMaterial("drivella-horizon-sunset-material", this.scene);
      material.disableLighting = true;
      material.fogEnabled = false;
      material.backFaceCulling = false;
      material.diffuseTexture = texture;
      material.opacityTexture = texture;
      material.emissiveTexture = texture;
      material.useAlphaFromDiffuseTexture = true;
      material.emissiveColor = new Color3(1, 0.88, 0.78);
      material.specularColor = Color3.Black();
      mesh.material = material;
      this.sunMesh = mesh;
      this.sunMaterial = material;
      this.sunEnabled = true;
      if (this.glowLayer) this.glowLayer.addExcludedMesh(mesh);
    } catch (error) {
      this.recordError("horizon sun", error);
    }
  }

  createShadowSystem() {
    if (!this.sunLight) return;
    try {
      this.sunLight.shadowEnabled = true;
      this.sunLight.shadowFrustumSize = 560;
      this.sunLight.shadowMinZ = 1;
      this.sunLight.shadowMaxZ = 1500;
      this.shadowGenerator = new ShadowGenerator(1536, this.sunLight);
      this.shadowGenerator.usePercentageCloserFiltering = true;
      this.shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
      this.shadowGenerator.bias = 0.00045;
      this.shadowGenerator.normalBias = 0.018;
      this.shadowGenerator.setDarkness(0.38);
      this.shadowGenerator.getShadowMap().refreshRate = 1;
    } catch (error) {
      this.recordError("directional shadows", error);
      this.shadowGenerator = null;
    }
  }

  registerShadowReceiver(mesh) {
    if (!this.shadowGenerator || !mesh || mesh.isDisposed?.() || mesh.metadata?.noShadowCaster || mesh.metadata?.isFX) return;
    if (mesh.name.startsWith("terrain-grid-") || mesh.name.startsWith("axis-")) return;
    if (this.shadowReceivers.has(mesh)) return;
    try {
      mesh.receiveShadows = true;
      mesh.isBlocker = true;
      this.shadowGenerator.addShadowCaster(mesh, false);
      this.shadowReceivers.add(mesh);
    } catch (error) {
      this.recordError("shadow caster " + mesh.name, error);
    }
  }

  createPostProcessing() {
    try {
      this.pipeline = new DefaultRenderingPipeline("drivella-legacy-render-pipeline", true, this.scene, [this.camera]);
      // GlowLayer is the single always-on neon halo. Global bloom is optional
      // and starts off so the same neon pixels are not bloomed twice.
      this.pipeline.bloomEnabled = false;
      this.pipeline.bloomThreshold = 0.94;
      this.pipeline.bloomWeight = 0.11;
      this.pipeline.bloomKernel = 48;
      this.pipeline.bloomScale = 0.5;
      this.pipeline.fxaaEnabled = true;
      this.pipeline.imageProcessingEnabled = true;
    } catch (error) {
      this.recordError("scene bloom pipeline", error);
      try {
        this.pipeline = new DefaultRenderingPipeline("drivella-legacy-render-pipeline-fallback", false, this.scene, [this.camera]);
        this.pipeline.bloomEnabled = false;
        this.pipeline.bloomThreshold = 0.95;
        this.pipeline.bloomWeight = 0.10;
        this.pipeline.bloomKernel = 40;
        this.pipeline.bloomScale = 0.5;
        this.pipeline.fxaaEnabled = true;
      } catch (fallbackError) {
        this.recordError("scene bloom fallback", fallbackError);
      }
    }

    try {
      this.ssao = new SSAORenderingPipeline(
        "drivella-legacy-ssao",
        this.scene,
        { ssaoRatio: 0.55, combineRatio: 1.0 },
        [this.camera]
      );
      this.ssao.radius = 3.2;
      this.ssao.totalStrength = 0.82;
      this.ssao.expensiveBlur = false;
      this.ssaoAttached = true;
    } catch (error) {
      this.recordError("SSAO", error);
      this.ssao = null;
    }

    try {
      this.ssr = new SSRRenderingPipeline(
        "drivella-screen-space-reflections",
        this.scene,
        [this.camera],
        false
      );
      // SSR is optional and starts detached. On activation it uses one
      // ray-march pass: no roughness blur/combine passes or huge ray budget.
      this.ssr.isEnabled = false;
      this.ssr.strength = 0.42;
      this.ssr.reflectivityThreshold = 0.18;
      this.ssr.roughnessFactor = 0;
      this.ssr.maxDistance = 96;
      this.ssr.maxSteps = 14;
      this.ssr.step = 4;
      this.ssr.samples = 1;
      this.ssr.blurDispersionStrength = 0;
      this.ssr.reflectionSpecularFalloffExponent = 2;
      this.ssr.attenuateScreenBorders = true;
    } catch (error) {
      this.recordError("screen-space reflections", error);
      this.ssr = null;
    }
  }

  createSunRays() {
    if (!this.sunMesh) return;
    try {
      this.vls = new VolumetricLightScatteringPostProcess(
        "drivella-horizon-god-rays",
        { postProcessRatio: 1, passRatio: 0.25 },
        this.camera,
        this.sunMesh,
        72,
        Texture.BILINEAR_SAMPLINGMODE,
        this.engine,
        false
      );
      this.vls.invert = true;
      this.vls.exposure = 0.24;
      this.vls.decay = 0.965;
      this.vls.weight = 0.34;
      this.vls.density = 0.82;
      this.vlsAttached = true;
    } catch (error) {
      this.recordError("volumetric God Rays", error);
      this.vls = null;
    }
  }

  createLensFlares() {
    if (!this.sunMesh) return;
    try {
      this.flareTextureUrl = makeLensFlarePngUrl();
      this.flareTextureKind = "canvas-png";
      this.scene.lensFlaresEnabled = true;
      this.sunFlareSystem = new LensFlareSystem("drivella-horizon-lens-flares", this.sunMesh, this.scene);
      this.lensFlareSystems.push(this.sunFlareSystem);
      new LensFlare(0.105, 0, new Color3(1, 0.58, 0.38), this.flareTextureUrl, this.sunFlareSystem);
      new LensFlare(0.045, 0.34, new Color3(0.35, 0.78, 1), this.flareTextureUrl, this.sunFlareSystem);
      new LensFlare(0.026, 0.62, new Color3(1, 0.34, 0.58), this.flareTextureUrl, this.sunFlareSystem);
    } catch (error) {
      this.recordError("lens flares", error);
      this.sunFlareSystem = null;
    }
  }

  createTrackLights() {
    if (!this.roadSamples?.length) return;
    const count = 8;
    for (let index = 0; index < count; index += 1) {
      const sample = this.roadSamples[Math.floor(index * this.roadSamples.length / count)];
      if (!sample) continue;
      const side = index % 2 === 0 ? 1 : -1;
      const light = new PointLight(
        "drivella-track-neon-light-" + index,
        new Vector3(
          sample.x + sample.normalX * side * 8.8,
          sample.y + 2.8,
          sample.z + sample.normalZ * side * 8.8
        ),
        this.scene
      );
      light.diffuse = index % 2 === 0 ? new Color3(0.16, 0.58, 1) : new Color3(0.82, 0.16, 0.56);
      light.specular = light.diffuse.clone();
      light.intensity = 0.62;
      light.range = 34;
      this.trackLights.push(light);
    }
  }

  attachVehicle(vehicle) {
    if (!vehicle || this.vehicle === vehicle) return;
    this.vehicle = vehicle;
    try {
      this.registerShadowReceiver(vehicle.chassis);
      for (const mesh of vehicle.bodyRoot?.getChildMeshes?.() ?? []) {
        this.registerShadowReceiver(mesh);
        this.applyVehicleOutline(mesh);
        if (mesh.metadata?.headlightOptic
            && (mesh.metadata.headlightPart === "lens" || mesh.metadata.headlightPart === "projector-core")) {
          this.headlampGlowMeshes.push(mesh);
        }
      }
      for (const pivot of vehicle.wheelPivots?.values?.() ?? []) {
        for (const mesh of pivot.getChildMeshes?.() ?? []) {
          this.registerShadowReceiver(mesh);
          this.applyVehicleOutline(mesh);
        }
      }

      // Register both projector spots before the decorative underbody points.
      // The road material is intentionally capped at 12 lights (2 sky/sun + 8
      // track + 2 headlights), so the two beams must occupy slots 10 and 11.
      for (const side of [-1, 1]) {
        const spot = new SpotLight(
          "drivella-countach-headlamp-" + side,
          Vector3.Zero(),
          new Vector3(0, -0.75, 0.66),
          Math.PI / 3.2,
          2.2,
          this.scene
        );
        // The lens geometry is expressed in body-space coordinates inside a transformed
        // optics root. Keep the light unparented and update its world pose from that root;
        // parenting a body-space projector point to the root double-transforms its offset.
        spot.position.set(0, 0, 0);
        spot.direction.set(0, -0.75, 0.66);
        spot.diffuse = new Color3(0.72, 0.86, 1);
        spot.specular = new Color3(0.72, 0.86, 1);
        spot.range = 86;
        spot.intensity = 0;
        this.headlampSpots.push(spot);
        this.headlampSpotBySide.set(side, spot);
        if (this.flareTextureUrl) {
          const lampFlare = new LensFlareSystem("drivella-headlamp-flares-" + side, spot, this.scene);
          lampFlare.isEnabled = this.lensFlaresEnabled;
          this.lensFlareSystems.push(lampFlare);
          // Headlamp flares are small optical ghosts; the physical lens glow supplies
          // the visible halo at the projector itself.
          new LensFlare(0.032, 0, new Color3(0.74, 0.86, 1), this.flareTextureUrl, lampFlare);
          new LensFlare(0.012, 0.42, new Color3(0.35, 0.72, 1), this.flareTextureUrl, lampFlare);
        }
      }

      // Decorative underbody lights follow the projectors in scene order so they
      // cannot push the right headlamp beyond the WebGL-safe road-light budget.
      for (const side of [-1, 1]) {
        const under = new PointLight(
          "drivella-countach-underbody-" + side,
          new Vector3(side * 0.78, -0.13, 0),
          this.scene
        );
        under.parent = vehicle.chassis;
        under.diffuse = new Color3(1, 0.018, 0.035);
        under.specular = new Color3(0.75, 0.012, 0.025);
        under.range = 10.5;
        under.intensity = this.underglowEnabled ? 2.0 : 0;
        this.underbodyLights.push(under);
      }

      for (const key of vehicle.wheelPivots?.keys?.() ?? []) {
        const disc = MeshBuilder.CreateDisc(
          "drivella-tire-contact-shadow-" + key,
          { radius: 0.52, tessellation: 28 },
          this.scene
        );
        disc.rotation.x = Math.PI / 2;
        disc.isPickable = false;
        disc.metadata = { ...(disc.metadata ?? {}), isFX: true, noShadowCaster: true };
        const material = new StandardMaterial("drivella-tire-shadow-material-" + key, this.scene);
        material.disableLighting = true;
        material.diffuseColor = new Color3(0.006, 0.004, 0.012);
        material.emissiveColor = new Color3(0.003, 0.002, 0.006);
        material.specularColor = Color3.Black();
        material.alpha = 0.23;
        material.backFaceCulling = false;
        disc.material = material;
        this.wheelShadows.set(key, disc);
        if (this.glowLayer) this.glowLayer.addExcludedMesh(disc);
      }

      this.tailMaterial = vehicle.tailMaterial ?? vehicle.materials?.get?.("bodyTail") ?? null;
      if (this.tailMaterial) this.tailMaterial.emissiveColor.set(0.38, 0.006, 0.018);
      vehicle.setHeadlightsDeployed?.(this.headlightsDeployed);
      this.setHeadlights(this.headlightsEnabled);
      this.syncHeadlampTransforms();
    } catch (error) {
      this.recordError("vehicle lighting", error);
    }
  }

  applyVehicleOutline(mesh) {
    if (!mesh || mesh.isDisposed?.()) return;
    mesh.renderOutline = this.outlinesEnabled;
    mesh.outlineColor = new Color3(0.010, 0.020, 0.050);
    mesh.outlineWidth = 0.050;
    this.outlineMeshes.add(mesh);
  }

  syncHeadlampTransforms() {
    const vehicle = this.vehicle;
    if (!vehicle) return;
    // The local axis follows the slanted projector face. After the -45° optic
    // counter-rotation it points down the road instead of into the sky.
    const localBeamAxis = new Vector3(0, -0.75, 0.66);
    for (const side of [-1, 1]) {
      const root = vehicle.headlightOpticRoots?.get?.(side);
      const aim = vehicle.headlightProjectorAims?.get?.(side);
      const spot = this.headlampSpotBySide.get(side);
      if (!root || !aim || !spot || root.isDisposed?.()) continue;
      root.computeWorldMatrix(true);
      const world = root.getWorldMatrix();
      const worldPosition = Vector3.TransformCoordinates(aim, world);
      const worldDirection = Vector3.TransformNormal(localBeamAxis, world);
      if (worldDirection.lengthSquared() > 1e-8) worldDirection.normalize();
      else worldDirection.set(0, 0, 1);
      spot.position.copyFrom(worldPosition);
      spot.direction.copyFrom(worldDirection);
    }
  }

  getRoadHeadlightUniforms() {
    const left = this.headlampSpotBySide.get(-1);
    const right = this.headlampSpotBySide.get(1);
    const direction = left && right
      ? left.direction.add(right.direction).normalize()
      : (left?.direction ?? right?.direction ?? new Vector3(0, 0, 1)).clone().normalize();
    return {
      positionL: left?.position ?? Vector3.Zero(),
      positionR: right?.position ?? Vector3.Zero(),
      direction,
      intensity: this.headlightRoadPower
    };
  }

  syncHeadlightOutput() {
    const deploy = this.vehicle?.headlightDeploy ?? 0;
    const deployPower = clamp((deploy - 0.12) / 0.88, 0, 1);
    const beamPower = this.headlightsEnabled ? deployPower : 0;
    // Stronger output is intentional: the road shader adds a soft beam to a dark
    // synthwave scene, while SpotLights provide visible local spill on nearby meshes.
    this.headlightRoadPower = beamPower * 2.35;
    for (const light of this.headlampSpots) light.intensity = 28 * beamPower;
    const emissive = new Color3(0.008 + beamPower * 1.05, 0.014 + beamPower * 1.18, 0.026 + beamPower * 1.34);
    for (const material of this.vehicle?.headlampLensMaterials ?? []) material.emissiveColor.copyFrom(emissive);
    // Feed the projector cores directly into the scene GlowLayer. This keeps
    // the halo anchored to the pop-up lamps instead of over the cabin.
    for (const mesh of this.headlampGlowMeshes) {
      if (!mesh || mesh.isDisposed?.()) continue;
      if (beamPower > 0.01) {
        mesh.metadata = {
          ...(mesh.metadata ?? {}),
          neonGlowColor: [1.65 * beamPower, 2.05 * beamPower, 2.65 * beamPower]
        };
      } else if (mesh.metadata?.neonGlowColor) {
        const metadata = { ...mesh.metadata };
        delete metadata.neonGlowColor;
        mesh.metadata = metadata;
      }
    }
    return beamPower > 0.01;
  }

  setHeadlights(enabled) {
    this.headlightsEnabled = Boolean(enabled);
    this.syncHeadlightOutput();
    return this.headlightsEnabled;
  }

  toggleHeadlights() {
    return this.setHeadlights(!this.headlightsEnabled);
  }

  setHeadlightsDeployed(enabled) {
    this.headlightsDeployed = Boolean(enabled);
    this.vehicle?.setHeadlightsDeployed?.(this.headlightsDeployed);
    this.syncHeadlightOutput();
    return this.headlightsDeployed;
  }

  toggleHeadlightDeployment() {
    return this.setHeadlightsDeployed(!this.headlightsDeployed);
  }

  setEnabled(name, enabled) {
    const value = Boolean(enabled);
    switch (name) {
      case "bloom":
        if (this.pipeline) this.pipeline.bloomEnabled = value;
        break;
      case "ssao":
        if (this.ssao && this.ssaoAttached !== value) {
          const manager = this.scene.postProcessRenderPipelineManager;
          if (value) manager.attachCamerasToRenderPipeline("drivella-legacy-ssao", [this.camera]);
          else manager.detachCamerasFromRenderPipeline("drivella-legacy-ssao", [this.camera]);
          this.ssaoAttached = value;
        }
        break;
      case "reflections":
        if (!this.ssr?.isSupported) {
          this.recordError("screen-space reflections", "SSR is not supported by this renderer.");
          return false;
        }
        try {
          this.ssr.isEnabled = value;
        } catch (error) {
          this.recordError("screen-space reflections toggle", error);
          return false;
        }
        break;
      case "shadows":
        if (this.sunLight) this.sunLight.shadowEnabled = value;
        break;
      case "sun":
        this.sunEnabled = value;
        this.sunMesh?.setEnabled(value);
        break;
      case "atmosphere":
        this.atmosphereEnabled = value;
        this.scene.fogEnabled = value;
        break;
      case "godRays":
        if (this.vls && this.vlsAttached !== value) {
          if (value) this.camera.attachPostProcess(this.vls);
          else this.camera.detachPostProcess(this.vls);
          this.vlsAttached = value;
        }
        break;
      case "lensFlares":
        this.lensFlaresEnabled = value;
        for (const system of this.lensFlareSystems) system.isEnabled = value;
        break;
      case "underglow":
        this.underglowEnabled = value;
        for (const light of this.underbodyLights) light.intensity = value ? 2.0 : 0;
        for (const shadow of this.wheelShadows.values()) shadow.setEnabled(value);
        break;
      case "outlines":
        this.outlinesEnabled = value;
        for (const mesh of this.outlineMeshes) {
          if (!mesh.isDisposed?.()) mesh.renderOutline = value;
        }
        break;
      case "headlights":
        this.setHeadlightsDeployed(value);
        break;
      case "headlightLighting":
        this.setHeadlights(value);
        break;
      default:
        return false;
    }
    return true;
  }

  update(vehicle = this.vehicle) {
    if (this.sunEnabled && this.sunTextureDraw && performance.now() - this.lastSunTextureUpdate > 120) {
      const now = performance.now();
      this.sunTextureDraw(now);
      this.lastSunTextureUpdate = now;
      if (this.sunMaterial) {
        const pulse = 0.96 + Math.sin(now * 0.00092) * 0.035;
        this.sunMaterial.emissiveColor.set(pulse, pulse * 0.87, pulse * 0.78);
      }
    }

    if (!vehicle) return;
    this.syncHeadlampTransforms();
    this.syncHeadlightOutput();

    // Running tail lamps stay visibly red; braking raises their output.
    if (this.tailMaterial) {
      const braking = Boolean(vehicle.brake || (vehicle.brakeRequested ?? 0) > 1);
      this.tailMaterial.emissiveColor = braking
        ? new Color3(1.45, 0.028, 0.075)
        : new Color3(0.42, 0.006, 0.022);
    }

    // Indicators follow the steering side and blink at the legacy cadence.
    const steerInput = Number(vehicle.steerInput ?? 0);
    const blinkOn = Math.sin(performance.now() * 0.012) > -0.15;
    for (const [side, material] of vehicle.turnSignalMaterials ?? []) {
      const selected = side < 0 ? steerInput < -0.16 : steerInput > 0.16;
      const active = selected && blinkOn;
      material.emissiveColor = active
        ? new Color3(1.65, 0.48, 0.045)
        : new Color3(0.012, 0.004, 0.001);
    }
    for (const [key, shadow] of this.wheelShadows) {
      const pivot = vehicle.wheelPivots?.get?.(key);
      if (!pivot || pivot.isDisposed?.()) continue;
      const point = pivot.getAbsolutePosition();
      shadow.position.set(
        point.x,
        point.y - vehicle.metrics.wheelRadius + 0.022,
        point.z
      );
      shadow.scaling.set(1.0, 1.0, 1.18);
    }
  }

  getStatus() {
    const forward = this.vehicle?.bodyRoot?.getDirection?.(Vector3.Forward())?.normalize?.() ?? new Vector3(0, 0, 1);
    const bodyPosition = this.vehicle?.bodyRoot?.getAbsolutePosition?.() ?? Vector3.Zero();
    const roadMeshes = this.headlightRoadMaterial
      ? this.scene.meshes.filter((mesh) => mesh.material === this.headlightRoadMaterial)
      : [];
    const activeMeshes = this.scene.getActiveMeshes?.()?.data ?? [];
    const cameraPlanes = this.camera?.getFrustumPlanes?.() ?? null;
    const roadMeshDiagnostics = roadMeshes.slice(0, 8).map((mesh) => ({
      name: mesh.name,
      enabled: mesh.isEnabled(),
      visible: mesh.isVisible,
      visibility: Number(mesh.visibility ?? 1),
      inFrustum: cameraPlanes ? mesh.isInFrustum(cameraPlanes) : null,
      active: activeMeshes.includes(mesh),
      subMeshes: mesh.subMeshes?.length ?? 0,
      effects: (mesh.subMeshes ?? []).map((subMesh) => ({
        hasEffect: Boolean(subMesh.effect),
        ready: Boolean(subMesh.effect?.isReady?.()),
        compilationError: subMesh.effect?.getCompilationError?.() ?? ""
      }))
    }));
    const headlightBeams = [...this.headlampSpotBySide.entries()].map(([side, spot]) => ({
      side: side < 0 ? "L" : "R",
      intensity: Number(spot.intensity ?? 0),
      positionDistance: Number(Vector3.Distance(spot.position, bodyPosition).toFixed(3)),
      forwardAlignment: Number(Vector3.Dot(spot.direction.clone().normalize(), forward).toFixed(3)),
      directionY: Number(spot.direction.y.toFixed(3))
    }));
    return {
      bloom: Boolean(this.pipeline?.bloomEnabled),
      ssao: Boolean(this.ssao && this.ssaoAttached),
      reflections: Boolean(this.ssr?.isSupported && this.ssr?.isEnabled),
      reflectionsSupported: Boolean(this.ssr?.isSupported),
      reflectionsQuality: this.ssr ? {
        strength: this.ssr.strength,
        maxDistance: this.ssr.maxDistance,
        maxSteps: this.ssr.maxSteps,
        step: this.ssr.step,
        blurDispersionStrength: this.ssr.blurDispersionStrength
      } : null,
      bloomSupported: Boolean(this.pipeline),
      bloomWeight: this.pipeline?.bloomWeight ?? null,
      glowIntensity: this.glowLayer?.intensity ?? null,
      shadows: Boolean(this.sunLight?.shadowEnabled),
      sun: Boolean(this.sunEnabled && this.sunMesh?.isEnabled()),
      sunFogExcluded: Boolean(this.sunMesh?.applyFog === false && this.sunMaterial?.fogEnabled === false),
      atmosphere: Boolean(this.atmosphereEnabled && this.scene.fogEnabled),
      godRays: Boolean(this.vls && this.vlsAttached),
      lensFlares: Boolean(this.lensFlareSystems.some((system) => system.isEnabled)),
      lensFlareTextureKind: this.flareTextureKind,
      lensFlareSpriteCount: this.lensFlareSystems.reduce((sum, system) => sum + system.lensFlares.length, 0),
      lensFlareTexturesReady: this.lensFlareSystems.flatMap((system) => system.lensFlares)
        .every((flare) => Boolean(flare.texture?.isReady?.())),
      headlampGlowMeshCount: this.headlampGlowMeshes.length,
      headlampGlowActiveCount: this.headlampGlowMeshes.filter((mesh) => Boolean(mesh.metadata?.neonGlowColor)).length,
      vehicleOutlineMeshCount: this.outlineMeshes.size,
      vehicleOutlineWidth: this.outlineMeshes.values().next().value?.outlineWidth ?? 0,
      glassMeshCount: this.vehicle?.bodyRoot?.getChildMeshes?.().filter((mesh) => mesh.name === "countach-glass").length ?? 0,
      frontTurnSignalCount: this.vehicle?.frontSignalMeshes?.size ?? 0,
      rearTurnSignalCount: this.vehicle?.rearSignalMeshes?.size ?? 0,
      fogLampCount: this.vehicle?.fogLightMeshes?.length ?? 0,
      tailLampEmissive: this.tailMaterial?.emissiveColor ? [this.tailMaterial.emissiveColor.r, this.tailMaterial.emissiveColor.g, this.tailMaterial.emissiveColor.b] : null,
      underglow: Boolean(this.underglowEnabled),
      outlines: Boolean(this.outlinesEnabled),
      headlights: Boolean(this.headlightsDeployed),
      headlightLighting: Boolean(this.headlightsEnabled),
      headlightDeploy: Number(this.vehicle?.headlightDeploy ?? 0),
      headlightBeamIntensity: Number(this.headlampSpots[0]?.intensity ?? 0),
      headlightSourceCount: this.headlampSpots.length,
      headlightBeams,
      headlightRoadPlugin: Boolean(this.headlightRoadPlugin),
      headlightRoadUniformBindCount: this.headlightRoadPlugin?.bindCount ?? 0,
      headlightRoadObservableBindCount: this.headlightRoadObservableBindCount,
      headlightRoadMaterialFrozen: Boolean(this.headlightRoadMaterial?.isFrozen),
      headlightRoadPluginActive: Boolean(this.headlightRoadMaterial?.pluginManager?._activePlugins?.includes(this.headlightRoadPlugin)),
      headlightRoadBindCallbackAvailable: typeof this.headlightRoadMaterial?._callbackPluginEventBindForSubMesh === "function",
      headlightRoadRunsCodeOnBind: Boolean(this.headlightRoadMaterial?._runsCodeOnBind?.()),
      headlightRoadMeshCount: roadMeshes.length,
      headlightRoadActiveMeshCount: roadMeshDiagnostics.filter((mesh) => mesh.active).length,
      headlightRoadInFrustumMeshCount: roadMeshDiagnostics.filter((mesh) => mesh.inFrustum).length,
      headlightRoadMeshDiagnostics: roadMeshDiagnostics,
      headlightRoadIntensity: Number(this.headlightRoadPlugin?.lastBound?.intensity ?? 0),
      headlightRoadDirectionY: Number(this.headlightRoadPlugin?.lastBound?.directionY ?? 0),
      headlightOpticPartCount: [...(this.vehicle?.headlightOpticRoots?.values?.() ?? [])].reduce((count, root) => count + (root.getChildMeshes?.().length ?? 0), 0),
      errors: this.errors.slice()
    };
  }
}
