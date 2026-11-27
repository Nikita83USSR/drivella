import {Color3,Mesh,MeshBuilder,PhysicsAggregate,PhysicsShapeType,Quaternion,StandardMaterial,TransformNode,Vector3,VertexData} from "@babylonjs/core";
import {PhysicsRaycastResult} from "@babylonjs/core/Physics/physicsRaycastResult.js";
const WHEEL_PARTS=new Set(["front_tyre","front_rims","front_extra_NoMaterial","rear_tyre","rear_rims"]);
const WHEELS=Object.freeze([Object.freeze({key:"frontLeft",axle:"front",side:-1}),Object.freeze({key:"frontRight",axle:"front",side:1}),Object.freeze({key:"rearLeft",axle:"rear",side:-1}),Object.freeze({key:"rearRight",axle:"rear",side:1})]);
const P=Object.freeze({mass:1250,cg:.50,spawn:.05,colliderH:.42,rest:.32,min:.12,max:.55,maxComp:.20,spring:38000,damper:4200,bump:98000,antiRoll:26000,rollStiffness:16000,rollDamping:4000,maxRollTorque:9000,maxForce:16000,maxSteer:.49,engine:8600,brake:19500,handbrake:10500,parkingBrake:18000,frontGrip:1.22,rearGrip:1.04,rearHandbrakeGrip:.32,frontCornering:5600,rearCornering:3950,drag:.46,rolling:.012});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
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
 for(const part of meta.parts){const pos=new Float32Array(part.indexCount*3);let o=0;
  for(let i=0;i<part.indexCount;i++){const vi=view.getUint16(part.indexOffset+i*2,true),vo=part.vertexOffset+vi*6;
   const x=view.getInt16(vo,true)/meta.unitsPerGameUnit,y=view.getInt16(vo+2,true)/meta.unitsPerGameUnit,z=view.getInt16(vo+4,true)/meta.unitsPerGameUnit;
   pos[o++]=x;pos[o++]=y;pos[o++]=z;if(!WHEEL_PARTS.has(part.name)){
    bounds.min.x=Math.min(bounds.min.x,x);bounds.min.y=Math.min(bounds.min.y,y);bounds.min.z=Math.min(bounds.min.z,z);
    bounds.max.x=Math.max(bounds.max.x,x);bounds.max.y=Math.max(bounds.max.y,y);bounds.max.z=Math.max(bounds.max.z,z);
   }
  }parts.set(part.name,pos);
 }
 const rf=tyreRadius(parts.get("front_tyre")),rr=tyreRadius(parts.get("rear_tyre"));
 const metrics=measureCountachRigMetrics(meta,(rf+rr)*.5);
 return {parts,bounds,bodySize:bounds.max.subtract(bounds.min),metrics};
}
function material(scene,name,diffuse,specular,power,emissive=null){
 const m=new StandardMaterial(name,scene);m.diffuseColor=Color3.FromHexString(diffuse);m.specularColor=Color3.FromHexString(specular);m.specularPower=power;m.backFaceCulling=true;if(emissive)m.emissiveColor=Color3.FromHexString(emissive);return m;
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
  this.scene=scene;this.model=model;this.metrics=model.metrics;this.mass=P.mass;this.keys=new Set();this.steer=0;this.steerInput=0;this.handbrake=false;this.brake=false;this.throttle=false;this.parked=true;this.driveRequested=0;this.brakeRequested=0;this.lastDt=1/60;
  this.wheelContacts=new Map();this.wheelSpin=new Map(WHEELS.map(w=>[w.key,0]));this.wheelPivots=new Map();this.materials=new Map();this.ray=new PhysicsRaycastResult();
  const yaw=Math.atan2(startSample.tangentX,startSample.tangentZ),width=clamp(model.bodySize.x*.88,1.72,2.05),length=clamp(model.bodySize.z*.80,3.65,4.05);
  this.unwrappedYaw=yaw;this.initialYaw=yaw;this.lastYaw=yaw;
  this.colliderDimensions={width,height:P.colliderH,length};
  this.chassis=MeshBuilder.CreateBox("drivella-countach-physics-chassis",{width,height:P.colliderH,depth:length},scene);
  this.chassis.position.set(startSample.x,startSample.y+P.cg+P.spawn,startSample.z);this.chassis.rotationQuaternion=Quaternion.RotationYawPitchRoll(yaw,0,0);
  this.chassis.isVisible=false;this.chassis.visibility=0;this.chassis.isPickable=false;this.chassis.checkCollisions=false;
  this.aggregate=new PhysicsAggregate(this.chassis,PhysicsShapeType.BOX,{mass:P.mass,friction:.2,restitution:.01},scene);
  this.aggregate.body.setLinearDamping(.018);this.aggregate.body.setAngularDamping(.42);
  this.bodyRoot=new TransformNode("drivella-countach-render-root",scene);this.bodyRoot.parent=this.chassis;this.bodyRoot.position.set(0,-P.cg-P.spawn,0);
  this.buildMaterials();this.buildBody();this.buildWheels();
  this.keydown=e=>{const k=String(e.key||"").toLowerCase();if(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"," "].includes(k)){e.preventDefault();this.parked=false;this.keys.add(k);}};
  this.keyup=e=>this.keys.delete(String(e.key||"").toLowerCase());this.blur=()=>this.keys.clear();
  window.addEventListener("keydown",this.keydown,{passive:false});window.addEventListener("keyup",this.keyup);window.addEventListener("blur",this.blur);
  this.observer=scene.onBeforePhysicsObservable.add(()=>this.stepPhysics());this.syncVisuals();
 }
 buildMaterials(){
  const p={bodyPaint:["#15529a","#b8d7ff",92],bodyPlastic:["#111a27","#536275",30],bodyBlack:["#05080f","#242d3c",18],
   bodyMetal:["#8798aa","#f0f5ff",120],bodyTail:["#6e0717","#ff687e",64],headlampR:["#c4d9ea","#ffffff",140,"#152538"],
   headlampL:["#c4d9ea","#ffffff",140,"#152538"],sideMirror_bodyPlastic:["#101b2c","#8ba6c2",80],frontDetail_detailRed:["#15529a","#b8d7ff",92],
   frontDetail_bodyPlastic:["#111a27","#536275",30],exhaustA_chrome:["#a9b5c3","#ffffff",150],exhaustB_chrome:["#a9b5c3","#ffffff",150],
   tyre:["#11151d","#394454",12],rims:["#a7b5c6","#ffffff",150],wheelExtra:["#62758c","#dceaff",95]};
  for(const [n,v] of Object.entries(p))this.materials.set(n,material(this.scene,"countach-material-"+n,v[0],v[1],v[2],v[3]??null));
 }
 buildBody(){for(const [n,pos] of this.model.parts)if(!WHEEL_PARTS.has(n))triangleMesh(this.scene,"countach-"+n,pos,this.bodyRoot,this.materials.get(n)??this.materials.get("bodyPlastic"));}
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
 wheelMount(w){const c=this.metrics.wheelCenters[w.axle];return new Vector3(w.side*c[0],c[1]+P.rest-P.cg-P.spawn,c[2]);}
 stepPhysics(){
  if(!this.aggregate?.body||this.aggregate.body.isDisposed)return;const physics=this.scene.getPhysicsEngine();if(!physics?.raycastToRef)return;
  const dt=clamp(this.scene.getEngine().getDeltaTime()/1000,1/240,1/30),matrix=this.bodyMatrix(),yaw=this.yawOf(matrix),position=this.chassis.position.clone();
  this.unwrappedYaw+=wrapVehicleAngle(yaw-this.lastYaw);this.lastYaw=yaw;
  const velocity=this.aggregate.body.getLinearVelocity(),angular=this.aggregate.body.getAngularVelocity();
  const left=this.keys.has("a")||this.keys.has("arrowleft"),right=this.keys.has("d")||this.keys.has("arrowright");
  this.steerInput=(right?1:0)-(left?1:0);this.throttle=this.keys.has("w")||this.keys.has("arrowup");this.brake=this.keys.has("s")||this.keys.has("arrowdown");this.handbrake=this.keys.has(" ");
  if(this.parked){
   const heldContacts=new Map();
   for(const w of WHEELS){
    const anchor=Vector3.TransformCoordinates(this.wheelMount(w),matrix),end=anchor.add(new Vector3(0,-(P.max+this.metrics.wheelRadius+.16),0));
    physics.raycastToRef(anchor,end,this.ray,{ignoreBody:this.aggregate.body});
    if(!this.ray.hasHit){heldContacts.set(w.key,{...w,hit:false,anchor,point:end,normal:Vector3.Up(),compression:-P.maxComp,steerAngle:0,longitudinalSpeed:0,lateralSpeed:0});continue;}
    const point=this.ray.hitPointWorld.clone(),normal=this.ray.hitNormalWorld.clone().normalize();
    if(normal.y<0)normal.scaleInPlace(-1);
    const suspensionLength=Vector3.Distance(anchor,point)-this.metrics.wheelRadius;
    const compression=clamp(P.rest-clamp(suspensionLength,P.min,P.max),-P.maxComp,P.maxComp);
    heldContacts.set(w.key,{...w,hit:suspensionLength<=P.max+.025,anchor,point,normal,compression,springForce:0,steerAngle:0,longitudinalSpeed:0,lateralSpeed:0,tireUtilization:0});
   }
   this.wheelContacts=heldContacts;
   this.aggregate.body.setLinearVelocity(Vector3.Zero());
   this.aggregate.body.setAngularVelocity(Vector3.Zero());
   this.aggregate.body.applyForce(new Vector3(0,this.mass*9.81,0),position);
   return;
  }
  const speed=Math.hypot(velocity.x,velocity.z),fade=clamp(speed/58,0,.58);this.lastDt=dt;this.steer+=(this.steerInput-this.steer)*clamp(dt*7.5,0,1);
  const ack=calculateAckermannAngles(this.steer,this.metrics.wheelbase,this.metrics.track,P.maxSteer*(1-fade));
  const bodyForward=new Vector3(Math.sin(yaw),0,Math.cos(yaw)),fwd=Vector3.Dot(velocity,bodyForward);let drive=this.throttle?P.engine*clamp(1-speed/82,.22,1):0,braking=0;
  if(this.brake){if(fwd>1)braking=P.brake;else drive=-P.engine*.48;}
  this.driveRequested=drive;this.brakeRequested=braking;
  const aero=P.drag*speed*speed,rolling=Math.abs(fwd)>.15?Math.sign(fwd)*this.mass*9.81*P.rolling:0,dragWheel=-(aero+rolling)*.25,driveRear=drive*.5,contacts=new Map();
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
   let spring=P.spring*Math.max(0,compression)-P.damper*pointVelocity.y;
   if(suspensionLength<P.min)spring+=(P.min-suspensionLength)*P.bump;spring=clamp(spring,0,P.maxForce);
   contacts.set(w.key,{...w,hit:true,anchor,point,normal,compression,springForce:spring,steerAngle:steer,longitudinalSpeed:0,longitudinalForce:0,lateralSpeed:0,lateralForce:0,tireUtilization:0});
   if(spring<=.5)continue;
   this.aggregate.body.applyForce(new Vector3(normal.x*spring/Math.max(normal.y,.35),spring,normal.z*spring/Math.max(normal.y,.35)),point);
   const wa=yaw+steer,nf=new Vector3(Math.sin(wa),0,Math.cos(wa)),forward=nf.subtract(normal.scale(Vector3.Dot(nf,normal))).normalize();
   const rightVector=Vector3.Cross(normal,forward).normalize(),wheelV=velocity.add(Vector3.Cross(angular,lever));
   const longV=Vector3.Dot(wheelV,forward),sideV=Vector3.Dot(wheelV,rightVector),rear=w.axle==="rear",mu=rear&&this.handbrake?P.rearHandbrakeGrip:rear?P.rearGrip:P.frontGrip,limit=mu*spring;
   const lateral=calculateLateralTireForce(sideV,rear?P.rearCornering:P.frontCornering,limit);let longitudinal=dragWheel;if(rear)longitudinal+=driveRear;
   if(this.brake&&braking>0){const share=rear?.42:.58;longitudinal-=Math.sign(longV||fwd||1)*braking*share*.5;}
   if(this.handbrake&&rear)longitudinal-=Math.sign(longV||fwd||1)*P.handbrake;
   if(this.parked&&Math.abs(longV)>.025)longitudinal-=Math.sign(longV)*P.parkingBrake;
   const tire=clampTireForce(longitudinal,lateral,limit);
   this.aggregate.body.applyForce(forward.scale(tire.longitudinal).add(rightVector.scale(tire.lateral)),point);
   const contact=contacts.get(w.key);contact.longitudinalSpeed=longV;contact.longitudinalForce=tire.longitudinal;contact.lateralSpeed=sideV;contact.lateralForce=tire.lateral;contact.tireUtilization=limit>0?Math.hypot(tire.longitudinal,tire.lateral)/limit:0;
  }
  const anti=(lk,rk)=>{const l=contacts.get(lk),r=contacts.get(rk);if(!l?.hit||!r?.hit)return;const force=(l.compression-r.compression)*P.antiRoll;
   this.aggregate.body.applyForce(new Vector3(0,-force,0),l.anchor);this.aggregate.body.applyForce(new Vector3(0,force,0),r.anchor);};
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
 }
 getPosition(){return this.chassis.position.clone();}
 getCameraTarget(){return this.chassis.position.add(new Vector3(0,-.10,0));}
 getTelemetry(){
  const p=this.chassis.position,v=this.aggregate.body.getLinearVelocity(),e=(this.chassis.rotationQuaternion??Quaternion.Identity()).toEulerAngles();
  const angular=this.aggregate.body.getAngularVelocity(),yaw=this.yawOf(this.bodyMatrix());
  const motion=calculateVehicleMotionTelemetry(v,yaw,angular.y);
  const wheels=WHEELS.map(w=>{const c=this.wheelContacts.get(w.key);return {
   key:w.key,axle:w.axle,contact:Boolean(c?.hit),compression:Number((c?.compression??0).toFixed(4)),
   springForce:Number((c?.springForce??0).toFixed(1)),steering:Number((c?.steerAngle??0).toFixed(4)),
   lateralSpeed:Number((c?.lateralSpeed??0).toFixed(3)),longitudinalSpeed:Number((c?.longitudinalSpeed??0).toFixed(3)),
   longitudinalForce:Number((c?.longitudinalForce??0).toFixed(1)),lateralForce:Number((c?.lateralForce??0).toFixed(1)),
   tireUtilization:Number((c?.tireUtilization??0).toFixed(3))
  };});
  const axleAverage=(axle,key)=>{const list=WHEELS.filter(w=>w.axle===axle).map(w=>this.wheelContacts.get(w.key)).filter(c=>c?.hit);
   return list.length?list.reduce((sum,c)=>sum+(c[key]??0),0)/list.length:0;};
  const totalSpringLoad=wheels.reduce((sum,w)=>sum+(this.wheelContacts.get(w.key)?.springForce??0),0);
  const rearLongitudinalForce=WHEELS.filter(w=>w.axle==="rear").reduce((sum,w)=>sum+(this.wheelContacts.get(w.key)?.longitudinalForce??0),0);
  const totalLongitudinalForce=WHEELS.reduce((sum,w)=>sum+(this.wheelContacts.get(w.key)?.longitudinalForce??0),0);
  const frontLateralSpeed=axleAverage("front","lateralSpeed"),rearLateralSpeed=axleAverage("rear","lateralSpeed");
  const rearLongitudinalSpeed=axleAverage("rear","longitudinalSpeed"),rearSlipAngle=Math.atan2(rearLateralSpeed,Math.max(Math.abs(rearLongitudinalSpeed),.5));
  return {
   x:Number(p.x.toFixed(3)),y:Number(p.y.toFixed(3)),z:Number(p.z.toFixed(3)),
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
   frontGrip:P.frontGrip,rearGrip:P.rearGrip,rearHandbrakeGrip:P.rearHandbrakeGrip,parked:this.parked,
   throttle:this.throttle,handbrake:this.handbrake,driveRequested:Number(this.driveRequested.toFixed(1)),brakeRequested:Number(this.brakeRequested.toFixed(1)),
   totalSpringLoad:Number(totalSpringLoad.toFixed(1)),rearLongitudinalForce:Number(rearLongitudinalForce.toFixed(1)),totalLongitudinalForce:Number(totalLongitudinalForce.toFixed(1)),wheels
  };
 }
 dispose(){this.scene.onBeforePhysicsObservable.remove(this.observer);window.removeEventListener("keydown",this.keydown);window.removeEventListener("keyup",this.keyup);window.removeEventListener("blur",this.blur);
  this.aggregate?.dispose();this.bodyRoot?.dispose(false,true);for(const p of this.wheelPivots.values())p.dispose(false,true);for(const m of this.materials.values())m.dispose();this.chassis?.dispose();}
}
