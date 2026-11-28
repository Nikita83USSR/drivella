import {Color3,Mesh,MeshBuilder,PhysicsAggregate,PhysicsShapeType,Quaternion,StandardMaterial,TransformNode,Vector3,VertexData} from "@babylonjs/core";
import {CellMaterial} from "@babylonjs/materials/cell/cellMaterial.js";
// Explicit .js suffix keeps the material import resolvable in both Node tests and esbuild.
import {PhysicsRaycastResult} from "@babylonjs/core/Physics/physicsRaycastResult.js";
const WHEEL_PARTS=new Set(["front_tyre","front_rims","front_extra_NoMaterial","rear_tyre","rear_rims"]);
const WHEELS=Object.freeze([Object.freeze({key:"frontLeft",axle:"front",side:-1}),Object.freeze({key:"frontRight",axle:"front",side:1}),Object.freeze({key:"rearLeft",axle:"rear",side:-1}),Object.freeze({key:"rearRight",axle:"rear",side:1})]);
// Babylon 9.37.2 PhysicsMotionType enum: STATIC=0, ANIMATED=1, DYNAMIC=2.
const BODY_MOTION=Object.freeze({STATIC:0,DYNAMIC:2});
const P=Object.freeze({mass:1250,cg:.50,spawn:.05,colliderH:.42,rest:.32,rideSag:.06,min:.12,max:.55,maxComp:.20,spring:38000,damper:4200,bump:98000,antiRoll:26000,maxLateralAccel:7.0,rollStiffness:16000,rollDamping:4000,maxRollTorque:9000,maxForce:16000,maxSteer:.49,engine:8600,brake:19500,handbrake:10500,parkingBrake:18000,frontGrip:1.22,rearGrip:1.04,rearHandbrakeGrip:.32,frontCornering:5600,rearCornering:3950,drag:.46,rolling:.012});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function calculatePopUpHeadlightAngle(deploy){const d=clamp(Number(deploy)||0,0,1),ease=d*d*(3-2*d);return Math.PI*.25*(1-ease);}
const POP_LAMP_FACE_H=.22;
const POP_LAMP_DIAG=Math.SQRT1_2;
const POP_HINGE_Y=.79425; // Exact hood-surface datum from the original Countach body profile.
function lampXBounds(side){return side<0?[-.895,-.445]:[.445,.895];}
function lampFrontPoint(x,t,offset=0){
 const yTop=.6961538461538462-.037;
 const yBase=yTop-POP_LAMP_FACE_H*POP_LAMP_DIAG;
 const zBase=2.60-POP_LAMP_FACE_H*POP_LAMP_DIAG;
 return [x,yBase+t*POP_LAMP_DIAG-offset*POP_LAMP_DIAG,zBase+t*POP_LAMP_DIAG+offset*POP_LAMP_DIAG];
}
function lampRearPoint(x){return [x,POP_HINGE_Y-.003-.037,2.30];}
function pushLampQuad(out,a,b,c,d){out.push(...a,...b,...c,...a,...c,...d);}
function buildCountachPopUpOptics(side){
 const [x0,x1]=lampXBounds(side),housing=[],front=[],bezel=[],lens=[],rings=[],core=[];
 const A0=lampRearPoint(x0),A1=lampRearPoint(x1),B0=lampFrontPoint(x0,0),B1=lampFrontPoint(x1,0),C0=lampFrontPoint(x0,POP_LAMP_FACE_H),C1=lampFrontPoint(x1,POP_LAMP_FACE_H);
 housing.push(...A0,...B0,...C0,...A1,...C1,...B1);
 pushLampQuad(housing,A0,A1,B1,B0);
 const inset=.008,t0=.008,t1=POP_LAMP_FACE_H-.008;
 pushLampQuad(front,lampFrontPoint(x0+inset,t0,.002),lampFrontPoint(x1-inset,t0,.002),lampFrontPoint(x1-inset,t1,.002),lampFrontPoint(x0+inset,t1,.002));
 const pad=.014,ix0=x0+.040,ix1=x1-.040,bt0=.014,bt1=POP_LAMP_FACE_H-.014,it0=.040,it1=POP_LAMP_FACE_H-.040,p=(x,t)=>lampFrontPoint(x,t,.006);
 pushLampQuad(bezel,p(x0+pad,bt0),p(x1-pad,bt0),p(ix1,it0),p(ix0,it0));
 pushLampQuad(bezel,p(x1-pad,bt0),p(x1-pad,bt1),p(ix1,it1),p(ix1,it0));
 pushLampQuad(bezel,p(x1-pad,bt1),p(x0+pad,bt1),p(ix0,it1),p(ix1,it1));
 pushLampQuad(bezel,p(x0+pad,bt1),p(x0+pad,bt0),p(ix0,it0),p(ix0,it1));
 pushLampQuad(lens,lampFrontPoint(x0+.040,.040,.008),lampFrontPoint(x1-.040,.040,.008),lampFrontPoint(x1-.040,POP_LAMP_FACE_H-.040,.008),lampFrontPoint(x0+.040,POP_LAMP_FACE_H-.040,.008));
 const segments=24,cy=POP_LAMP_FACE_H*.5,centers=[x0+(x1-x0)*.34,x0+(x1-x0)*.66],ro=.037,ri=.028;
 for(const cx of centers)for(let i=0;i<segments;i++){
  const a=i*Math.PI*2/segments,b=(i+1)*Math.PI*2/segments,point=(r,t)=>lampFrontPoint(cx+Math.cos(t)*r,cy+Math.sin(t)*r,.011);
  const A=point(ro,a),B=point(ro,b),C=point(ri,b),D=point(ri,a);rings.push(...A,...B,...C,...A,...C,...D);
 }
 const r=.028;
 for(const cx of centers){
  const center=lampFrontPoint(cx,cy,.013);
  for(let i=0;i<segments;i++){
   const a=i*Math.PI*2/segments,b=(i+1)*Math.PI*2/segments,point=t=>lampFrontPoint(cx+Math.cos(t)*r,cy+Math.sin(t)*r,.013);
   core.push(...center,...point(a),...point(b));
  }
 }
 return {
  housing:new Float32Array(housing),front:new Float32Array(front),bezel:new Float32Array(bezel),
  lens:new Float32Array(lens),rings:new Float32Array(rings),core:new Float32Array(core),
  projectorAim:new Vector3(side*.67, lampFrontPoint(side*.67,cy,.013)[1], lampFrontPoint(side*.67,cy,.013)[2])
 };
}

export function calculateStaticSuspensionCompression(wheelCenterY,wheelRadius,rideSag=.06){
 return wheelRadius-wheelCenterY+rideSag;
}
export function wrapVehicleAngle(angle){return Math.atan2(Math.sin(angle),Math.cos(angle));}
export function calculateVehicleMotionTelemetry(velocity,yaw,yawRate=0){
 const forwardX=Math.sin(yaw),forwardZ=Math.cos(yaw),rightX=Math.cos(yaw),rightZ=-Math.sin(yaw);
 const forwardSpeed=velocity.x*forwardX+velocity.z*forwardZ;
 const lateralSpeed=velocity.x*rightX+velocity.z*rightZ;
 const speed=Math.hypot(velocity.x,velocity.z),velocityHeading=speed>.05?Math.atan2(velocity.x,velocity.z):yaw;
 return {speed,forwardSpeed,lateralSpeed,slipAngle:Math.atan2(lateralSpeed,Math.max(Math.abs(forwardSpeed),.5)),velocityHeading,headingError:wrapVehicleAngle(velocityHeading-yaw),yawRate};
}
export function calculateLateralTireForce(lateralSpeed,corneringStiffness,frictionLimit){
 const limit=Math.max(0,frictionLimit)*.92;
 return clamp(-lateralSpeed*corneringStiffness,-limit,limit);
}
export function calculateSpeedSteerLimit(speed,wheelbase,maxLateralAccel,maximumAngle=P.maxSteer){
 const v=Math.max(0,Number.isFinite(speed)?speed:0);
 if(v<=.5)return maximumAngle;
 return Math.min(maximumAngle,Math.atan(wheelbase*maxLateralAccel/(v*v)));
}
export function calculateAntiRollForces(leftCompression,rightCompression,stiffness){
 const force=(leftCompression-rightCompression)*Math.max(0,stiffness);
 return {leftY:force||0,rightY:(-force)||0};
}
export function calculateAckermannAngles(input,wheelbase,track,maximumAngle=P.maxSteer){
 const centre=clamp(input,-1,1)*maximumAngle;if(Math.abs(centre)<1e-5)return {left:0,right:0};
 const dir=Math.sign(centre),radius=wheelbase/Math.tan(Math.abs(centre)),half=track*.5;
 const angle=side=>dir*Math.atan2(wheelbase,Math.max(.25,radius-dir*side*half));
 return {left:angle(-1),right:angle(1)};
}
export function clampTireForce(longitudinal,lateral,frictionLimit){
 const limit=Math.max(0,frictionLimit),m=Math.hypot(longitudinal,lateral);
 if(m<=limit||m<1e-8)return {longitudinal,lateral,scale:1};
 const scale=limit/m;return {longitudinal:longitudinal*scale,lateral:lateral*scale,scale};
}
export function measureCountachRigMetrics(meta,wheelRadius){
 if(!meta?.wheelCenters?.front||!meta?.wheelCenters?.rear)throw new TypeError("Countach wheel-centre metadata is missing.");
 const f=meta.wheelCenters.front,r=meta.wheelCenters.rear,track=Math.abs(f[0])*2,wheelbase=Math.abs(f[2]-r[2]);
 if(!Number.isFinite(track)||!Number.isFinite(wheelbase)||track<=0||wheelbase<=0)throw new RangeError("Countach wheel layout is invalid.");
 if(!Number.isFinite(wheelRadius)||wheelRadius<.20||wheelRadius>1.10)throw new RangeError("Countach tyre radius is outside expected model scale.");
 return {track,wheelbase,wheelRadius,wheelCenters:{front:[...f],rear:[...r]}};
}
function mirrorX(src){const out=new Float32Array(src.length);for(let i=0;i<src.length;i+=9){
 out[i]=-src[i+6];out[i+1]=src[i+7];out[i+2]=src[i+8];out[i+3]=-src[i+3];out[i+4]=src[i+4];out[i+5]=src[i+5];out[i+6]=-src[i];out[i+7]=src[i+1];out[i+8]=src[i+2];}return out;}
function tyreRadius(pos){if(!pos?.length)throw new Error("Countach tyre geometry is missing.");let r=0;for(let i=0;i<pos.length;i+=3)r=Math.max(r,Math.hypot(pos[i+1],pos[i+2]));return r;}
async function decodeModel(meta,encoded){
 if(!meta||meta.version!==2||!Array.isArray(meta.parts))throw new Error("Countach model metadata missing or unsupported.");
 if(typeof encoded!=="string"||!encoded.length)throw new Error("Countach model data missing.");
 if(typeof DecompressionStream==="undefined")throw new Error("Countach decompression unavailable in this browser.");
 const b64=atob(encoded),packed=new Uint8Array(b64.length);for(let i=0;i<b64.length;i++)packed[i]=b64.charCodeAt(i);
 const stream=new Blob([packed]).stream().pipeThrough(new DecompressionStream("deflate")),raw=new Uint8Array(await new Response(stream).arrayBuffer());
 if(raw.byteLength!==meta.rawBytes)throw new Error("Countach geometry byte-count integrity check failed.");
 const view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),parts=new Map(),bounds={min:new Vector3(Infinity,Infinity,Infinity),max:new Vector3(-Infinity,-Infinity,-Infinity)};
 const movingCaps={left:[],right:[]},rearSignals={left:[],right:[]},frontLowerPaint=[];
 let hoodCapTriangles=0,frontOverlayTriangles=0,lowerPanelTriangles=0;
 for(const part of meta.parts){
  // Replace the source model's fixed optics with the moving DRIVELLA pop-up modules.
  if(part.name==="headlampR"||part.name==="headlampL")continue;
  if(part.indexCount%3!==0)throw new Error("Countach part contains an incomplete triangle: "+part.name);
  const pos=new Float32Array(part.indexCount*3);let writeAt=0;
  for(let i=0;i<part.indexCount;i+=3){
   const triangle=[];
   for(let j=0;j<3;j++){
    const vi=view.getUint16(part.indexOffset+(i+j)*2,true),vo=part.vertexOffset+vi*6;
    const point=[view.getInt16(vo,true)/meta.unitsPerGameUnit,view.getInt16(vo+2,true)/meta.unitsPerGameUnit,view.getInt16(vo+4,true)/meta.unitsPerGameUnit];
    triangle.push(point);
    if(!WHEEL_PARTS.has(part.name)){
     bounds.min.x=Math.min(bounds.min.x,point[0]);bounds.min.y=Math.min(bounds.min.y,point[1]);bounds.min.z=Math.min(bounds.min.z,point[2]);
     bounds.max.x=Math.max(bounds.max.x,point[0]);bounds.max.y=Math.max(bounds.max.y,point[1]);bounds.max.z=Math.max(bounds.max.z,point[2]);
    }
   }
   const oldTriangularHoodCap=part.name==="bodyPaint"&&triangle.every(p=>{
    const ax=Math.abs(p[0]);return ax>=.60&&ax<=1.12&&p[1]>=.63&&p[1]<=.86&&p[2]>=2.19&&p[2]<=2.46;
   });
   if(oldTriangularHoodCap){
    hoodCapTriangles++;const target=triangle[0][0]<0?movingCaps.left:movingCaps.right;
    for(const point of triangle)target.push(...point);continue;
   }
   const oldFrontHeadlampOverlay=part.name==="bodyPlastic"&&triangle.every(p=>
    Math.abs(p[2]-2.4561)<.00015&&Math.abs(p[0])>=.62&&Math.abs(p[0])<=1.07&&p[1]>=.67&&p[1]<=.86
   );
   if(oldFrontHeadlampOverlay){frontOverlayTriangles++;continue;}
   const oldLowerBlackHeadlampPanel=part.name==="bodyBlack"&&triangle.every(p=>
    Math.abs(p[0])>=.62&&Math.abs(p[0])<=1.07&&p[1]>=.57&&p[1]<=.68&&p[2]>=2.47&&p[2]<=2.71
   );
   if(oldLowerBlackHeadlampPanel){for(const point of triangle)frontLowerPaint.push(...point);lowerPanelTriangles++;continue;}
   if(part.name==="bodyTail"){
    const centerX=(triangle[0][0]+triangle[1][0]+triangle[2][0])/3;
    if(Math.abs(centerX)>.935){
     const target=centerX<0?rearSignals.left:rearSignals.right;
     for(const point of triangle)target.push(point[0],point[1],point[2]-.004);
     continue;
    }
   }
   for(const point of triangle){pos[writeAt++]=point[0];pos[writeAt++]=point[1];pos[writeAt++]=point[2];}
  }
  parts.set(part.name,writeAt===pos.length?pos:pos.slice(0,writeAt));
 }
 if(hoodCapTriangles!==58||movingCaps.left.length!==261||movingCaps.right.length!==261){
  throw new Error("Countach pop-up cap extraction mismatch: "+JSON.stringify({hoodCapTriangles,left:movingCaps.left.length/9,right:movingCaps.right.length/9}));
 }
 parts.set("movingLampCapL",new Float32Array(movingCaps.left));
 parts.set("movingLampCapR",new Float32Array(movingCaps.right));
 if(rearSignals.left.length!==18||rearSignals.right.length!==18){
  throw new Error("Countach rear indicator extraction mismatch: "+JSON.stringify({left:rearSignals.left.length/9,right:rearSignals.right.length/9}));
 }
 parts.set("bodyTailSignalL",new Float32Array(rearSignals.left));
 parts.set("bodyTailSignalR",new Float32Array(rearSignals.right));
 if(frontLowerPaint.length)parts.set("frontLowerPaint",new Float32Array(frontLowerPaint));
 const rf=tyreRadius(parts.get("front_tyre")),rr=tyreRadius(parts.get("rear_tyre"));
 const metrics=measureCountachRigMetrics(meta,(rf+rr)*.5);
 return {parts,bounds,bodySize:bounds.max.subtract(bounds.min),metrics,headlampGeometry:{capTrianglesPerSide:29,frontOverlayTriangles,lowerPanelTriangles}};
}
function material(scene,name,diffuse,specular,power,emissive=null){
 const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(diffuse);m.specularColor=Color3.FromHexString(specular);m.specularPower=power;m.backFaceCulling=false;m.twoSidedLighting=true;if(emissive)m.emissiveColor=Color3.FromHexString(emissive);return m;
}
function cellMaterial(scene,name,diffuse){
 const m=new CellMaterial(name,scene);m.diffuseColor=Color3.FromHexString(diffuse);m.computeHighLevel=true;m.maxSimultaneousLights=4;m.backFaceCulling=false;m.twoSidedLighting=true;return m;
}
function triangleMesh(scene,name,pos,parent,mat){
 if(!pos?.length||pos.length%9!==0)throw new Error("Invalid Countach triangle geometry: "+name);
 const mesh=new Mesh(name,scene),indices=Array.from({length:pos.length/3},(_,i)=>i),normals=new Float32Array(pos.length);
 VertexData.ComputeNormals(pos,indices,normals);const data=new VertexData();data.positions=pos;data.indices=indices;data.normals=normals;data.applyToMesh(mesh,true);
 mesh.parent=parent;mesh.material=mat;mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=true;return mesh;
}
function wheelAtPivot(src){return src;}

export class VehicleController{
 static async create(scene,opts){const meta=opts?.assetMeta??globalThis.DRIVELLA_COUNTACH_META,data=opts?.assetData??globalThis.DRIVELLA_COUNTACH_DATA;return new VehicleController(scene,{...opts,model:await decodeModel(meta,data)});}
 constructor(scene,{roadSamples,startSample=roadSamples?.[0],model}){
  if(!scene?.getPhysicsEngine?.())throw new Error("Vehicle requires active Havok Physics V2.");
  if(!Array.isArray(roadSamples)||roadSamples.length<2||!startSample)throw new TypeError("Vehicle requires sampled road and spawn point.");
  this.scene=scene;this.model=model;this.startSample=startSample;this.metrics=model.metrics;this.mass=P.mass;this.keys=new Set();this.steer=0;this.steerInput=0;this.handbrake=false;this.brake=false;this.throttle=false;this.parked=true;this.driveRequested=0;this.brakeRequested=0;this.lastDt=1/60;
  this.wheelContacts=new Map();this.wheelSpin=new Map(WHEELS.map(w=>[w.key,0]));this.wheelPivots=new Map();this.headlightPivots=new Map();this.headlightCaps=new Map();this.headlightOpticRoots=new Map();this.headlightProjectorAims=new Map();this.headlampLensMaterials=[];this.headlightDeploy=0;this.headlightDeployTarget=0;this.materials=new Map();this.ray=new PhysicsRaycastResult();this.appliedDriveForceWorld=Vector3.Zero();
  const yaw=Math.atan2(startSample.tangentX,startSample.tangentZ),width=clamp(model.bodySize.x*.88,1.72,2.05),length=clamp(model.bodySize.z*.80,3.65,4.05);
  this.unwrappedYaw=yaw;this.initialYaw=yaw;this.lastYaw=yaw;
  this.colliderDimensions={width,height:P.colliderH,length};
  this.chassis=MeshBuilder.CreateBox("drivella-countach-physics-chassis",{width,height:P.colliderH,depth:length},scene);
  this.chassis.position.set(startSample.x,startSample.y+P.cg+P.spawn,startSample.z);this.chassis.rotationQuaternion=Quaternion.RotationYawPitchRoll(yaw,0,0);
  this.chassis.isVisible=false;this.chassis.visibility=0;this.chassis.isPickable=false;this.chassis.checkCollisions=false;
  this.aggregate=new PhysicsAggregate(this.chassis,PhysicsShapeType.BOX,{mass:P.mass,friction:.2,restitution:.01},scene);
  this.aggregate.body.setMotionType(BODY_MOTION.STATIC);
  this.aggregate.body.setLinearDamping(.018);this.aggregate.body.setAngularDamping(.42);
  this.bodyRoot=new TransformNode("drivella-countach-render-root",scene);this.bodyRoot.parent=this.chassis;this.bodyRoot.position.set(0,-P.cg-P.spawn,0);
  this.buildMaterials();this.buildBody();this.buildHeadlights();this.buildSignals();this.buildWheels();
  this.keydown=e=>{const k=String(e.key||"").toLowerCase();if(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"," "].includes(k)){e.preventDefault();if(this.parked){this.aggregate.body.setMotionType(BODY_MOTION.DYNAMIC);this.aggregate.body.setLinearVelocity(Vector3.Zero());this.aggregate.body.setAngularVelocity(Vector3.Zero());this.parked=false;}this.keys.add(k);}};
  this.keyup=e=>this.keys.delete(String(e.key||"").toLowerCase());this.blur=()=>this.keys.clear();
  window.addEventListener("keydown",this.keydown,{passive:false});window.addEventListener("keyup",this.keyup);window.addEventListener("blur",this.blur);
  this.observer=scene.onBeforePhysicsObservable.add(()=>this.stepPhysics());this.syncVisuals();
 }
 buildMaterials(){
  const p={bodyPaint:["#b80518","#ffffff",72],bodyPlastic:["#111a27","#a9c5e6",92],bodyBlack:["#05080f","#242d3c",18],
   bodyMetal:["#8798aa","#f0f5ff",120],bodyTail:["#6e0717","#ff687e",64],headlampR:["#c4d9ea","#ffffff",140,"#152538"],
   headlampL:["#c4d9ea","#ffffff",140,"#152538"],sideMirror_bodyPlastic:["#101b2c","#8ba6c2",110],frontDetail_detailRed:["#b80518","#ffffff",140],
   frontDetail_bodyPlastic:["#111a27","#536275",30],exhaustA_chrome:["#a9b5c3","#ffffff",150],exhaustB_chrome:["#a9b5c3","#ffffff",150],
   tyre:["#11151d","#394454",12],rims:["#a7b5c6","#ffffff",150],wheelExtra:["#62758c","#dceaff",95]};
  // Keep edge outlines for the toon look, but use StandardMaterial on paint and glazing
  // so the body can receive sharp specular highlights instead of flat CellMaterial bands.
  const toonParts=new Set(["bodyBlack","frontDetail_bodyPlastic"]);
  for(const [n,v] of Object.entries(p)){
   const mat=toonParts.has(n)
    ?cellMaterial(this.scene,"countach-toon-material-"+n,v[0])
    :material(this.scene,"countach-material-"+n,v[0],v[1],v[2],v[3]??null);
   this.materials.set(n,mat);
  }
  this.materials.set("frontLowerPaint",cellMaterial(this.scene,"countach-toon-material-front-lower-paint","#b80518"));
  this.materials.set("turnSignalL",material(this.scene,"countach-turn-signal-left","#4a2108","#ffb65b",72,"#120600"));
  this.materials.set("turnSignalR",material(this.scene,"countach-turn-signal-right","#4a2108","#ffb65b",72,"#120600"));
  this.materials.set("fogLamp",material(this.scene,"countach-fog-lamp","#d7e5f4","#ffffff",180,"#7c9ab8"));
  this.headlampLensMaterials=[this.materials.get("headlampL"),this.materials.get("headlampR")];
  this.turnSignalMaterials=new Map([[-1,this.materials.get("turnSignalL")],[1,this.materials.get("turnSignalR")]]);
  this.tailMaterial=this.materials.get("bodyTail");
 }
 buildBody(){for(const [n,pos] of this.model.parts)if(!WHEEL_PARTS.has(n)&&!n.startsWith("movingLampCap")&&!n.startsWith("bodyTailSignal"))triangleMesh(this.scene,"countach-"+n,pos,this.bodyRoot,this.materials.get(n)??this.materials.get("bodyPlastic"));}
 buildSignals(){
  const quad=(a,b,c,d)=>new Float32Array([...a,...b,...c,...a,...c,...d]);
  this.frontSignalMeshes=new Map();
  this.rearSignalMeshes=new Map();
  this.fogLightMeshes=[];
  for(const side of [-1,1]){
   const key=side<0?"L":"R";
   const x0=side<0?-.87:.72,x1=side<0?-.72:.87;
   const amber=quad([x0,.360,2.981],[x1,.360,2.981],[x1,.270,2.981],[x0,.270,2.981]);
   const front=triangleMesh(this.scene,"countach-front-turn-signal-"+key,amber,this.bodyRoot,this.turnSignalMaterials.get(side));
   front.metadata={...(front.metadata??{}),vehicleSignal:true,signalSide:key,signalPosition:"front"};
   this.frontSignalMeshes.set(side,front);
   const rearData=this.model.parts.get("bodyTailSignal"+key);
   if(!rearData)throw new Error("Countach rear turn signal geometry is missing: "+key);
   const rear=triangleMesh(this.scene,"countach-rear-turn-signal-"+key,rearData,this.bodyRoot,this.turnSignalMaterials.get(side));
   rear.metadata={...(rear.metadata??{}),vehicleSignal:true,signalSide:key,signalPosition:"rear"};
   this.rearSignalMeshes.set(side,rear);
   // Inboard white running/fog lamps from the original Countach bumper layout.
   const fx0=side<0?-.655:.555,fx1=side<0?-.555:.655;
   const fogGeometry=quad([fx0,.360,2.981],[fx1,.360,2.981],[fx1,.270,2.981],[fx0,.270,2.981]);
   const fog=triangleMesh(this.scene,"countach-front-fog-lamp-"+key,fogGeometry,this.bodyRoot,this.materials.get("fogLamp"));
   fog.metadata={...(fog.metadata??{}),vehicleFogLamp:true};
   this.fogLightMeshes.push(fog);
  }
 }
 buildHeadlights(){
  const hinge=new Vector3(0,.76,2.30);
  for(const side of [-1,1]){
   const key=side<0?"L":"R",pivot=new TransformNode("countach-popup-headlight-pivot-"+key,this.scene);
   pivot.parent=this.bodyRoot;pivot.position.copyFrom(hinge);pivot.rotation.x=calculatePopUpHeadlightAngle(0);
   this.headlightPivots.set(side,pivot);
   const source=this.model.parts.get("movingLampCap"+key);
   if(!source)throw new Error("Countach moving pop-up hood cap is missing: "+key);
   const local=new Float32Array(source.length);
   for(let i=0;i<source.length;i+=3){local[i]=source[i]-hinge.x;local[i+1]=source[i+1]-hinge.y;local[i+2]=source[i+2]-hinge.z;}
   const cap=triangleMesh(this.scene,"countach-popup-hood-cap-"+key,local,pivot,this.materials.get("bodyPaint"));
   cap.metadata={...(cap.metadata??{}),headlightCap:true};
   this.headlightCaps.set(side,cap);

   // Match the original DRIVELLA optical mount exactly: offset, X/Z fit scale,
   // -45° counter-rotation and the hood-surface datum before the shared hinge.
   const mount=new TransformNode("countach-popup-optic-mount-"+key,this.scene);
   mount.parent=pivot;mount.position.set(side*.23230,-.026,0);
   const scaleNode=new TransformNode("countach-popup-optic-scale-"+key,this.scene);
   scaleNode.parent=mount;scaleNode.scaling.set(.9215686274509803,1,.5687);
   const rotationNode=new TransformNode("countach-popup-optic-counter-rotation-"+key,this.scene);
   rotationNode.parent=scaleNode;rotationNode.rotation.x=-Math.PI*.25;
   const opticsRoot=new TransformNode("countach-popup-optics-"+key,this.scene);
   opticsRoot.parent=rotationNode;opticsRoot.position.set(0,-POP_HINGE_Y,-2.30);
   this.headlightOpticRoots.set(side,opticsRoot);

   const geometry=buildCountachPopUpOptics(side),glass=this.materials.get(side<0?"headlampL":"headlampR");
   const parts=[
    ["housing",geometry.housing,this.materials.get("bodyBlack")],
    ["front",geometry.front,this.materials.get("bodyBlack")],
    ["bezel",geometry.bezel,this.materials.get("bodyMetal")],
    ["lens",geometry.lens,glass],
    ["projector-rings",geometry.rings,this.materials.get("bodyMetal")],
    ["projector-core",geometry.core,glass]
   ];
   for(const [partName,positions,material] of parts){
    const mesh=triangleMesh(this.scene,"countach-popup-"+partName+"-"+key,positions,opticsRoot,material);
    mesh.metadata={...(mesh.metadata??{}),headlightOptic:true,headlightSide:key,headlightPart:partName};
   }
   this.headlightProjectorAims.set(side,geometry.projectorAim);
   if(!this.headlampLensMaterials.includes(glass))this.headlampLensMaterials.push(glass);
  }
 }
 setHeadlightsDeployed(enabled){
  this.headlightDeployTarget=enabled?1:0;
  return Boolean(this.headlightDeployTarget);
 }
 buildWheels(){
  for(const w of WHEELS){const pivot=new TransformNode("countach-wheel-pivot-"+w.key,this.scene);this.wheelPivots.set(w.key,pivot);
   const c=this.metrics.wheelCenters[w.axle],signed=[w.side*c[0],c[1],c[2]],names=w.axle==="front"?["front_tyre","front_rims","front_extra_NoMaterial"]:["rear_tyre","rear_rims"];
   for(const n of names){const src=this.model.parts.get(n);if(!src)continue;const sided=w.side<0?mirrorX(src):src,local=wheelAtPivot(sided),mat=n.endsWith("_tyre")?"tyre":n.endsWith("_rims")?"rims":"wheelExtra";
    triangleMesh(this.scene,"countach-"+w.key+"-"+n,local,pivot,this.materials.get(mat));
   }
  }
 }
 bodyMatrix(){this.chassis.computeWorldMatrix(true);return this.chassis.getWorldMatrix();}
 yawOf(m){const f=Vector3.TransformNormal(Vector3.Forward(),m).normalize();return Math.atan2(f.x,f.z);}
 wheelMount(w){const c=this.metrics.wheelCenters[w.axle];return new Vector3(w.side*c[0],c[1]+P.rest-P.cg-P.spawn-P.rideSag,c[2]);}
 stepPhysics(){
  if(!this.aggregate?.body||this.aggregate.body.isDisposed)return;const physics=this.scene.getPhysicsEngine();if(!physics?.raycastToRef)return;
  const dt=clamp(physics.getTimeStep(),1/240,1/30),matrix=this.bodyMatrix(),yaw=this.yawOf(matrix),position=this.chassis.position.clone();
  this.unwrappedYaw+=wrapVehicleAngle(yaw-this.lastYaw);this.lastYaw=yaw;
  const velocity=this.aggregate.body.getLinearVelocity(),angular=this.aggregate.body.getAngularVelocity();
  const left=this.keys.has("a")||this.keys.has("arrowleft"),right=this.keys.has("d")||this.keys.has("arrowright");
  this.steerInput=(right?1:0)-(left?1:0);this.throttle=this.keys.has("w")||this.keys.has("arrowup");this.brake=this.keys.has("s")||this.keys.has("arrowdown");this.handbrake=this.keys.has(" ");
  if(this.parked){
   // The chassis is STATIC here and its spawn pose is fixed. Derive the
   // four resting tyre contacts from the measured road sample instead of
   // issuing four expensive Havok raycasts on every idle render frame.
   const heldContacts=new Map(),normal=Vector3.Up();
   for(const w of WHEELS){
    const anchor=Vector3.TransformCoordinates(this.wheelMount(w),matrix);
    const point=new Vector3(anchor.x,this.startSample.y,anchor.z);
    const suspensionLength=Vector3.Distance(anchor,point)-this.metrics.wheelRadius;
    const compression=clamp(P.rest-clamp(suspensionLength,P.min,P.max),-P.maxComp,P.maxComp);
    heldContacts.set(w.key,{...w,hit:true,anchor,anchorY:anchor.y,point,normal:normal.clone(),compression,suspensionLength,
     pointVelocityY:0,springCompressionForce:0,damperForce:0,bumpForce:0,springForce:0,
     steerAngle:0,longitudinalSpeed:0,longitudinalForce:0,lateralSpeed:0,lateralForce:0,tireUtilization:0});
   }
   this.wheelContacts=heldContacts;
   return;
  }
  const speed=Math.hypot(velocity.x,velocity.z),fade=clamp(speed/58,0,.58);this.lastDt=dt;this.steer+=(this.steerInput-this.steer)*clamp(dt*7.5,0,1);
  const lateralSteerLimit=calculateSpeedSteerLimit(speed,this.metrics.wheelbase,P.maxLateralAccel,P.maxSteer);
  const ack=calculateAckermannAngles(this.steer,this.metrics.wheelbase,this.metrics.track,lateralSteerLimit);
  const bodyForward=new Vector3(Math.sin(yaw),0,Math.cos(yaw)),fwd=Vector3.Dot(velocity,bodyForward);let drive=this.throttle?P.engine*clamp(1-speed/82,.22,1):0,braking=0;
  if(this.brake){if(fwd>1)braking=P.brake;else drive=-P.engine*.48;}
  this.driveRequested=drive;this.brakeRequested=braking;
  const aero=P.drag*speed*speed,rolling=Math.abs(fwd)>.15?Math.sign(fwd)*this.mass*9.81*P.rolling:0,dragWheel=-(aero+rolling)*.25,driveRear=drive*.5,contacts=new Map();
  this.appliedDriveForceWorld.set(0,0,0);
  for(const w of WHEELS){
   const anchor=Vector3.TransformCoordinates(this.wheelMount(w),matrix),end=anchor.add(new Vector3(0,-(P.max+this.metrics.wheelRadius+.16),0));
   physics.raycastToRef(anchor,end,this.ray,{ignoreBody:this.aggregate.body});
   const steer=w.axle==="front"?(w.side<0?ack.left:ack.right):0;
   if(!this.ray.hasHit){contacts.set(w.key,{...w,hit:false,anchor,point:end,normal:Vector3.Up(),compression:-P.maxComp,springForce:0,steerAngle:steer,longitudinalSpeed:0});continue;}
   const point=this.ray.hitPointWorld.clone(),normal=this.ray.hitNormalWorld.clone().normalize();if(normal.y<0)normal.scaleInPlace(-1);
   const suspensionLength=Vector3.Distance(anchor,point)-this.metrics.wheelRadius;
   if(suspensionLength>P.max+.025){contacts.set(w.key,{...w,hit:false,anchor,point,normal,compression:-P.maxComp,springForce:0,steerAngle:steer,longitudinalSpeed:0});continue;}
   const length=clamp(suspensionLength,P.min,P.max),compression=clamp(P.rest-length,-P.maxComp,P.maxComp);
   const lever=point.subtract(position),pointVelocity=velocity.add(Vector3.Cross(angular,lever));
   const springCompressionForce=P.spring*Math.max(0,compression);
   const damperForce=-P.damper*pointVelocity.y;
   const bumpForce=suspensionLength<P.min?(P.min-suspensionLength)*P.bump:0;
   const rawSpringForce=springCompressionForce+damperForce+bumpForce;
   const spring=clamp(rawSpringForce,0,P.maxForce);
   contacts.set(w.key,{...w,hit:true,anchor,anchorY:anchor.y,point,normal,compression,suspensionLength,pointVelocityY:pointVelocity.y,
    springCompressionForce,damperForce,bumpForce,rawSpringForce,springForce:spring,steerAngle:steer,longitudinalSpeed:0,longitudinalForce:0,lateralSpeed:0,lateralForce:0,tireUtilization:0});
   if(spring<=.5)continue;
   // Havok applyForce scales by its fixed 1/60 step even when the world uses a variable frame delta.
   // Convert Newtons to an impulse using the exact same dt that Havok will integrate this frame.
   this.aggregate.body.applyForce(new Vector3(normal.x*spring/Math.max(normal.y,.35),spring,normal.z*spring/Math.max(normal.y,.35)),point);
   const wa=yaw+steer,nf=new Vector3(Math.sin(wa),0,Math.cos(wa)),forward=nf.subtract(normal.scale(Vector3.Dot(nf,normal))).normalize();
   const rightVector=Vector3.Cross(normal,forward).normalize(),wheelV=velocity.add(Vector3.Cross(angular,lever));
   const longV=Vector3.Dot(wheelV,forward),sideV=Vector3.Dot(wheelV,rightVector),rear=w.axle==="rear",mu=rear&&this.handbrake?P.rearHandbrakeGrip:rear?P.rearGrip:P.frontGrip,limit=mu*spring;
   const lateral=calculateLateralTireForce(sideV,rear?P.rearCornering:P.frontCornering,limit);let longitudinal=dragWheel;if(rear)longitudinal+=driveRear;
   if(this.brake&&braking>0){const share=rear?.42:.58;longitudinal-=Math.sign(longV||fwd||1)*braking*share*.5;}
   if(this.handbrake&&rear)longitudinal-=Math.sign(longV||fwd||1)*P.handbrake;
   if(this.parked&&Math.abs(longV)>.025)longitudinal-=Math.sign(longV)*P.parkingBrake;
   const tire=clampTireForce(longitudinal,lateral,limit);
   const appliedForce=forward.scale(tire.longitudinal).add(rightVector.scale(tire.lateral));
   this.aggregate.body.applyForce(appliedForce,point);this.appliedDriveForceWorld.addInPlace(appliedForce);
   const contact=contacts.get(w.key);contact.longitudinalSpeed=longV;contact.longitudinalForce=tire.longitudinal;
   contact.appliedForceX=appliedForce.x;contact.appliedForceZ=appliedForce.z;contact.pointY=point.y;contact.normalY=normal.y;
   contact.lateralSpeed=sideV;contact.lateralForce=tire.lateral;contact.tireUtilization=limit>0?Math.hypot(tire.longitudinal,tire.lateral)/limit:0;
  }
  const anti=(lk,rk)=>{const l=contacts.get(lk),r=contacts.get(rk);if(!l?.hit||!r?.hit)return;const force=calculateAntiRollForces(l.compression,r.compression,P.antiRoll);
   this.aggregate.body.applyForce(new Vector3(0,force.leftY,0),l.anchor);this.aggregate.body.applyForce(new Vector3(0,force.rightY,0),r.anchor);};
  anti("frontLeft","frontRight");anti("rearLeft","rearRight");
  const orientation=this.chassis.rotationQuaternion??Quaternion.Identity();
  const bodyRoll=orientation.toEulerAngles().z;
  const rollAxis=Vector3.TransformNormal(Vector3.Forward(),matrix).normalize();
  const rollRate=Vector3.Dot(angular,rollAxis);
  const rollTorque=clamp(-bodyRoll*P.rollStiffness-rollRate*P.rollDamping,-P.maxRollTorque,P.maxRollTorque);
  this.aggregate.body.applyTorque(rollAxis.scale(rollTorque));
  for(const c of contacts.values())if(c.hit)this.wheelSpin.set(c.key,(this.wheelSpin.get(c.key)??0)+c.longitudinalSpeed/this.metrics.wheelRadius*dt);
  this.wheelContacts=contacts;
 }
 syncVisuals(){
  if(!this.chassis||this.chassis.isDisposed?.())return;const m=this.bodyMatrix(),yaw=this.yawOf(m);
  for(const w of WHEELS){const c=this.wheelContacts.get(w.key),pivot=this.wheelPivots.get(w.key);if(!pivot)continue;let centre;
   if(c?.hit)centre=c.point.add(c.normal.scale(this.metrics.wheelRadius));else{const a=Vector3.TransformCoordinates(this.wheelMount(w),m);centre=a.subtract(new Vector3(0,P.rest,0));}
   pivot.position.copyFrom(centre);const steer=Quaternion.RotationYawPitchRoll(yaw+(c?.steerAngle??0),0,0),spin=Quaternion.RotationAxis(Vector3.Right(),this.wheelSpin.get(w.key)??0);pivot.rotationQuaternion=steer.multiply(spin);
  }
  const frameDt=clamp((this.scene.getEngine()?.getDeltaTime?.()??16.667)/1000,0,.05);
  this.headlightDeploy+=(this.headlightDeployTarget-this.headlightDeploy)*(1-Math.exp(-7*frameDt));
  const headlightAngle=calculatePopUpHeadlightAngle(this.headlightDeploy);
  for(const pivot of this.headlightPivots.values())pivot.rotation.x=headlightAngle;
 }
 getPosition(){return this.chassis.position.clone();}
 getCameraTarget(){return this.chassis.position.add(new Vector3(0,-.10,0));}
 getTelemetry(){
  const p=this.chassis.position,v=this.aggregate.body.getLinearVelocity(),massProperties=this.aggregate.body.getMassProperties(),gravityFactor=this.aggregate.body.getGravityFactor(),e=(this.chassis.rotationQuaternion??Quaternion.Identity()).toEulerAngles();
  const angular=this.aggregate.body.getAngularVelocity(),yaw=this.yawOf(this.bodyMatrix());
  const motion=calculateVehicleMotionTelemetry(v,yaw,angular.y);
  const wheels=WHEELS.map(w=>{const c=this.wheelContacts.get(w.key);return {
   key:w.key,axle:w.axle,contact:Boolean(c?.hit),compression:Number((c?.compression??0).toFixed(4)),
   springForce:Number((c?.springForce??0).toFixed(1)),springCompressionForce:Number((c?.springCompressionForce??0).toFixed(1)),
   damperForce:Number((c?.damperForce??0).toFixed(1)),bumpForce:Number((c?.bumpForce??0).toFixed(1)),rawSpringForce:Number((c?.rawSpringForce??0).toFixed(1)),
   anchorY:Number((c?.anchorY??0).toFixed(3)),suspensionLength:Number((c?.suspensionLength??0).toFixed(4)),pointVelocityY:Number((c?.pointVelocityY??0).toFixed(4)),
   steering:Number((c?.steerAngle??0).toFixed(4)),
   lateralSpeed:Number((c?.lateralSpeed??0).toFixed(3)),longitudinalSpeed:Number((c?.longitudinalSpeed??0).toFixed(3)),
   longitudinalForce:Number((c?.longitudinalForce??0).toFixed(1)),lateralForce:Number((c?.lateralForce??0).toFixed(1)),
   appliedForceX:Number((c?.appliedForceX??0).toFixed(1)),appliedForceZ:Number((c?.appliedForceZ??0).toFixed(1)),
   contactY:Number((c?.pointY??0).toFixed(3)),normalY:Number((c?.normalY??0).toFixed(3)),
   tireUtilization:Number((c?.tireUtilization??0).toFixed(3))
  };});
  const axleAverage=(axle,key)=>{const list=WHEELS.filter(w=>w.axle===axle).map(w=>this.wheelContacts.get(w.key)).filter(c=>c?.hit);
   return list.length?list.reduce((sum,c)=>sum+(c[key]??0),0)/list.length:0;};
  const totalSpringLoad=wheels.reduce((sum,w)=>sum+(this.wheelContacts.get(w.key)?.springForce??0),0);
  const maxSuspensionCompression=Math.max(0,...wheels.map(w=>w.compression));
  const averageSuspensionCompression=wheels.reduce((sum,w)=>sum+w.compression,0)/Math.max(1,wheels.length);
  const rearLongitudinalForce=WHEELS.filter(w=>w.axle==="rear").reduce((sum,w)=>sum+(this.wheelContacts.get(w.key)?.longitudinalForce??0),0);
  const totalLongitudinalForce=WHEELS.reduce((sum,w)=>sum+(this.wheelContacts.get(w.key)?.longitudinalForce??0),0);
  const frontLateralSpeed=axleAverage("front","lateralSpeed"),rearLateralSpeed=axleAverage("rear","lateralSpeed");
  const rearLongitudinalSpeed=axleAverage("rear","longitudinalSpeed"),rearSlipAngle=Math.atan2(rearLateralSpeed,Math.max(Math.abs(rearLongitudinalSpeed),.5));
  return {
   x:Number(p.x.toFixed(3)),y:Number(p.y.toFixed(3)),z:Number(p.z.toFixed(3)),
   bodyMass:Number(massProperties.mass.toFixed(2)),gravityFactor:Number(gravityFactor.toFixed(3)),
   physicsStep:Number(this.scene.getPhysicsEngine().getTimeStep().toFixed(6)),physicsSubStep:Number(this.scene.getPhysicsEngine().getSubTimeStep().toFixed(3)),
   engineTimeStepMs:Number(this.scene.getEngine().getTimeStep().toFixed(3)),deterministicLockstep:this.scene.getEngine().isDeterministicLockStep(),lockstepMaxSteps:this.scene.getEngine().getLockstepMaxSteps(),
   speed:Number(motion.speed.toFixed(3)),speedKmh:Number((motion.speed*3.6).toFixed(1)),
   forwardSpeed:Number(motion.forwardSpeed.toFixed(3)),lateralSpeed:Number(motion.lateralSpeed.toFixed(3)),
   slipAngle:Number(motion.slipAngle.toFixed(4)),slipAngleDegrees:Number((motion.slipAngle*57.2957795).toFixed(2)),
   headingError:Number(motion.headingError.toFixed(4)),yawRate:Number(motion.yawRate.toFixed(4)),
   unwrappedYaw:Number(this.unwrappedYaw.toFixed(4)),yawTurns:Number((Math.abs(this.unwrappedYaw-this.initialYaw)/(Math.PI*2)).toFixed(3)),
   rearSlipAngle:Number(rearSlipAngle.toFixed(4)),rearSlipAngleDegrees:Number((rearSlipAngle*57.2957795).toFixed(2)),
   frontLateralSpeed:Number(frontLateralSpeed.toFixed(3)),rearLateralSpeed:Number(rearLateralSpeed.toFixed(3)),
   roll:Number(e.z.toFixed(4)),pitch:Number(e.x.toFixed(4)),steer:Number(this.steer.toFixed(3)),
   wheelContactCount:wheels.filter(w=>w.contact).length,wheelbase:Number(this.metrics.wheelbase.toFixed(4)),
   track:Number(this.metrics.track.toFixed(4)),wheelRadius:Number(this.metrics.wheelRadius.toFixed(4)),
   frontGrip:P.frontGrip,rearGrip:P.rearGrip,rearHandbrakeGrip:P.rearHandbrakeGrip,maxLateralAccel:P.maxLateralAccel,steerLimit:Number(calculateSpeedSteerLimit(motion.speed,this.metrics.wheelbase,P.maxLateralAccel,P.maxSteer).toFixed(4)),parked:this.parked,
   throttle:this.throttle,handbrake:this.handbrake,driveRequested:Number(this.driveRequested.toFixed(1)),brakeRequested:Number(this.brakeRequested.toFixed(1)),
   velocityX:Number(v.x.toFixed(4)),velocityY:Number(v.y.toFixed(4)),velocityZ:Number(v.z.toFixed(4)),
   maxSuspensionCompression:Number(maxSuspensionCompression.toFixed(4)),averageSuspensionCompression:Number(averageSuspensionCompression.toFixed(4)),
   appliedDriveForceWorldX:Number(this.appliedDriveForceWorld.x.toFixed(1)),appliedDriveForceWorldZ:Number(this.appliedDriveForceWorld.z.toFixed(1)),
   bodyForwardX:Number(Math.sin(yaw).toFixed(4)),bodyForwardZ:Number(Math.cos(yaw).toFixed(4)),
   totalSpringLoad:Number(totalSpringLoad.toFixed(1)),rearLongitudinalForce:Number(rearLongitudinalForce.toFixed(1)),totalLongitudinalForce:Number(totalLongitudinalForce.toFixed(1)),wheels
  };
 }
 dispose(){this.scene.onBeforePhysicsObservable.remove(this.observer);window.removeEventListener("keydown",this.keydown);window.removeEventListener("keyup",this.keyup);window.removeEventListener("blur",this.blur);
  this.aggregate?.dispose();this.bodyRoot?.dispose(false,true);for(const p of this.wheelPivots.values())p.dispose(false,true);for(const m of this.materials.values())m.dispose();this.chassis?.dispose();}
}
