import { Component, OnInit } from '@angular/core';

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader';
import { SAOPass } from 'three/examples/jsm/postprocessing/SAOPass';
import { GUI} from 'three/examples/jsm/libs/lil-gui.module.min'
import { WebGLPathTracer } from 'three-gpu-pathtracer';

@Component({
  selector: 'app-threejs',
  templateUrl: './threejs.component.html',
  styleUrls: ['./threejs.component.scss']
})
export class ThreejsComponent implements OnInit {
  scene: THREE.Scene = new THREE.Scene();
  renderer: THREE.WebGLRenderer = new THREE.WebGLRenderer({alpha: true, antialias: true});
  controls?: OrbitControls;

  gltfLoader: GLTFLoader = new GLTFLoader()
  dracoLoader: DRACOLoader = new DRACOLoader();
  ktx: KTX2Loader = new KTX2Loader();
  pmremGenerator: THREE.PMREMGenerator | undefined = undefined;
  pathTracer!: WebGLPathTracer;

  ngOnInit(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.LinearToneMapping;
    this.renderer.toneMappingExposure = 0.75;
    this.renderer.shadowMap.type =THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.enabled = true;
    this.renderer.setPixelRatio(window.devicePixelRatio)

    document.body.appendChild(this.renderer.domElement);

    this.dracoLoader.setDecoderPath('/assets/draco/')
    this.ktx.setTranscoderPath('/assets/basis/')
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
    this.ktx.detectSupport(this.renderer)
    this.gltfLoader.setKTX2Loader(this.ktx)

    var that = this;

    this.gltfLoader.load('assets/carton_for_torben.glb', (glb) => {
      this.scene.add(glb.scene);
      this.scene.add(new THREE.AmbientLight())

      let userData = glb.scene.userData;
      let bgColor = userData["gltfExtensions"].HYB_scene_background;
      let topColor = this.normalizedRgbArrayToHex(bgColor.topcolor);
      let bottomColor = this.normalizedRgbArrayToHex(bgColor.bottomcolor);
      this.renderer.domElement.style.backgroundImage = "linear-gradient(" + topColor + ", " + bottomColor + ")";

      // Set up OrbitControls
      this.controls = new OrbitControls(glb.cameras[0], this.renderer.domElement);
      this.controls.target = new THREE.Box3().setFromObject(glb.scene).getCenter(new THREE.Vector3());
      this.controls.addEventListener('change', function() {
        console.log("The camera controller detected a change!")
      })

      this.pathTracer.setScene(this.scene, glb.cameras[0]);

      let dirLight = new THREE.DirectionalLight();
      dirLight.position.set(glb.cameras[0].position.x, glb.cameras[0].position.y, glb.cameras[0].position.z);
      dirLight.lookAt(glb.scene.position)


      this.loadEXRFromGLB(glb).then(function(env: any) {
        that.scene.environment = env.texture;
      });

    }, undefined, (error) => {
      console.error('An error occurred while loading the GLTF model:', error);
    });

    this.renderer.setAnimationLoop(this.animate)

    // Handle window resize
    window.addEventListener('resize', () => {
      (this.controls!.object! as THREE.PerspectiveCamera).aspect = window.innerWidth / window.innerHeight;
      (this.controls!.object! as THREE.PerspectiveCamera).updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight)
    });

    this.pathTracer = new WebGLPathTracer(this.renderer)
  }

  normalizedRgbArrayToHex(normalizedRgbArray: number[]) {
    return '#' + normalizedRgbArray.map(num => {
        let intVal = Math.round(num * 255);
        let hex = intVal.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

  // Animation loop
  private animate = () => {
    if (this.controls) {
      this.renderer.render(this.scene, (this.controls!.object! as THREE.PerspectiveCamera));
      this.pathTracer.renderSample();
    }
  }

  private loadEXRFromGLB(glb: any) {
    const image = glb.parser.json.images.find((data: any) => data.mimeType === 'image/x-exr');

    if (image) {
      return glb.parser.getDependency('bufferView', image.bufferView).then((buffer: any) => {
        const texData = new EXRLoader().parse(buffer);
        const texture = new THREE.DataTexture(texData.data, texData.width, texData.height, texData.format, texData.type);
        
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.colorSpace = THREE.LinearSRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        texture.flipY = false;
        texture.needsUpdate = true;

        this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        const envMap = this.pmremGenerator.fromEquirectangular(texture);
        return envMap;
      });
    }

    return Promise.reject('No EXR image found in the GLTF file');
  }
}