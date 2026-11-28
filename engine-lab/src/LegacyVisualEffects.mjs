import {
  Color3,
  DefaultRenderingPipeline,
  DynamicTexture,
  LensFlare,
  LensFlareSystem,
  Mesh,
  MeshBuilder,
  PointLight,
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

    const aura = ctx.createRadialGradient(center, center, radius * 0.36, center, center, 505);
    aura.addColorStop(0, "rgba(255,76,45,0.44)");
    aura.addColorStop(0.30, "rgba(255,54,70,0.26)");
    aura.addColorStop(0.66, "rgba(205,34,112,0.11)");
    aura.addColorStop(1, "rgba(160,28,112,0)");
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
  constructor(scene, engine, camera, sunLight, { glowLayer = null, roadSamples = [] } = {}) {
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
    this.underglowEnabled = true;
    this.lensFlaresEnabled = true;
    this.sunEnabled = true;
    this.lastSunTextureUpdate = 0;
    this.vehicle = null;
    this.wheelShadows = new Map();
    this.headlampSpots = [];
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
    this.vlsAttached = false;

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
      mesh.metadata = { ...(mesh.metadata ?? {}), isFX: true, noShadowCaster: true };
      const material = new StandardMaterial("drivella-horizon-sunset-material", this.scene);
      material.disableLighting = true;
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
      this.pipeline.bloomEnabled = true;
      this.pipeline.bloomThreshold = 0.78;
      this.pipeline.bloomWeight = 0.34;
      this.pipeline.bloomKernel = 64;
      this.pipeline.bloomScale = 0.5;
      this.pipeline.fxaaEnabled = true;
      this.pipeline.imageProcessingEnabled = true;
    } catch (error) {
      this.recordError("scene bloom pipeline", error);
      try {
        this.pipeline = new DefaultRenderingPipeline("drivella-legacy-render-pipeline-fallback", false, this.scene, [this.camera]);
        this.pipeline.bloomEnabled = true;
        this.pipeline.bloomThreshold = 0.82;
        this.pipeline.bloomWeight = 0.26;
        this.pipeline.bloomKernel = 48;
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
        "drivella-legacy-screen-space-reflections",
        this.scene,
        [this.camera],
        false
      );
      this.ssr.isEnabled = true;
      this.ssr.strength = 0.72;
      this.ssr.reflectivityThreshold = 0.085;
      this.ssr.roughnessFactor = 0.18;
      this.ssr.maxDistance = 280;
      this.ssr.maxSteps = 28;
      this.ssr.step = 3;
      this.ssr.blurDispersionStrength = 0.012;
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
      const flareSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><radialGradient id="g"><stop stop-color="#fff" stop-opacity="1"/><stop offset=".18" stop-color="#ffe7ce" stop-opacity=".85"/><stop offset=".42" stop-color="#ff9b83" stop-opacity=".32"/><stop offset="1" stop-color="#ff6470" stop-opacity="0"/></radialGradient></defs><rect width="128" height="128" fill="url(#g)"/></svg>';
      this.flareTextureUrl = "data:image/svg+xml;base64," + btoa(flareSvg);
      this.scene.lensFlaresEnabled = true;
      this.sunFlareSystem = new LensFlareSystem("drivella-horizon-lens-flares", this.sunMesh, this.scene);
      this.lensFlareSystems.push(this.sunFlareSystem);
      new LensFlare(0.44, 0, new Color3(1, 0.48, 0.28), this.flareTextureUrl, this.sunFlareSystem);
      new LensFlare(0.18, 0.34, new Color3(0.30, 0.74, 1), this.flareTextureUrl, this.sunFlareSystem);
      new LensFlare(0.12, 0.62, new Color3(1, 0.28, 0.52), this.flareTextureUrl, this.sunFlareSystem);
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
      for (const mesh of vehicle.bodyRoot?.getChildMeshes?.() ?? []) this.registerShadowReceiver(mesh);
      for (const pivot of vehicle.wheelPivots?.values?.() ?? []) {
        for (const mesh of pivot.getChildMeshes?.() ?? []) this.registerShadowReceiver(mesh);
      }

      for (const side of [-1, 1]) {
        const spot = new SpotLight(
          "drivella-countach-headlamp-" + side,
          new Vector3(side * 0.62, 0.30, 1.65),
          new Vector3(0, -0.10, 1).normalize(),
          Math.PI / 3.2,
          2.2,
          this.scene
        );
        spot.parent = vehicle.chassis;
        spot.diffuse = new Color3(0.72, 0.86, 1);
        spot.specular = new Color3(0.72, 0.86, 1);
        spot.range = 86;
        spot.intensity = 0;
        this.headlampSpots.push(spot);
        if (this.flareTextureUrl) {
          const lampFlare = new LensFlareSystem("drivella-headlamp-flares-" + side, spot, this.scene);
          lampFlare.isEnabled = this.lensFlaresEnabled;
          this.lensFlareSystems.push(lampFlare);
          new LensFlare(0.24, 0, new Color3(0.74, 0.86, 1), this.flareTextureUrl, lampFlare);
          new LensFlare(0.09, 0.42, new Color3(0.35, 0.72, 1), this.flareTextureUrl, lampFlare);
        }

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

      const bodyTail = vehicle.materials?.get?.("bodyTail");
      if (bodyTail) bodyTail.emissiveColor = new Color3(0.24, 0.008, 0.018);
      for (const key of ["headlampL", "headlampR"]) {
        const lamp = vehicle.materials?.get?.(key);
        if (lamp) lamp.emissiveColor = new Color3(0.52, 0.68, 0.9);
      }
      this.setHeadlights(this.headlightsEnabled);
    } catch (error) {
      this.recordError("vehicle lighting", error);
    }
  }

  setHeadlights(enabled) {
    this.headlightsEnabled = Boolean(enabled);
    for (const light of this.headlampSpots) light.intensity = this.headlightsEnabled ? 8.5 : 0;
    return this.headlightsEnabled;
  }

  toggleHeadlights() {
    return this.setHeadlights(!this.headlightsEnabled);
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
        if (this.ssr) this.ssr.isEnabled = value;
        break;
      case "shadows":
        if (this.sunLight) this.sunLight.shadowEnabled = value;
        break;
      case "sun":
        this.sunEnabled = value;
        this.sunMesh?.setEnabled(value);
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
      case "headlights":
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
    return {
      bloom: Boolean(this.pipeline?.bloomEnabled),
      ssao: Boolean(this.ssao && this.ssaoAttached),
      reflections: Boolean(this.ssr?.isEnabled),
      shadows: Boolean(this.sunLight?.shadowEnabled),
      sun: Boolean(this.sunEnabled && this.sunMesh?.isEnabled()),
      godRays: Boolean(this.vls && this.vlsAttached),
      lensFlares: Boolean(this.lensFlareSystems.some((system) => system.isEnabled)),
      underglow: Boolean(this.underglowEnabled),
      headlights: Boolean(this.headlightsEnabled),
      errors: this.errors.slice()
    };
  }
}
