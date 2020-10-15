import { Vector3 } from 'three';
import { rafCallbacks, camera } from './scene.js';

/* global ResonanceAudio */
// Notes in the key of G
const fileNames = [
	"assets/piano/piano_mf_4_G.mp3",
	// "assets/piano/piano_mf_5_Ab.mp3",
	"assets/piano/piano_mf_5_A.mp3",
	// "assets/piano/piano_mf_5_Bb.mp3",
	"assets/piano/piano_mf_5_B.mp3",
	"assets/piano/piano_mf_5_C.mp3",
	// "assets/piano/piano_mf_5_Db.mp3",
	"assets/piano/piano_mf_5_D.mp3",
	// "assets/piano/piano_mf_5_Eb.mp3",
	"assets/piano/piano_mf_5_E.mp3",
	// "assets/piano/piano_mf_5_F.mp3",
	"assets/piano/piano_mf_5_Gb.mp3",
	"assets/piano/piano_mf_5_G.mp3",
];
const notes = new Map();

// Create an AudioContext
const audioContext = new AudioContext();
const resonanceAudioScene = new ResonanceAudio(audioContext);
resonanceAudioScene.output.connect(audioContext.destination);

const tempVector1 = new Vector3();
const tempVector2 = new Vector3();
rafCallbacks.add(function () {
	tempVector1.set(0, 0, -1);
	tempVector1.applyQuaternion( camera.quaternion );
	tempVector2.set(0, 1, 0);
	tempVector2.applyQuaternion( camera.quaternion );
	resonanceAudioScene.setListenerOrientation(
		tempVector1.x,
		tempVector1.y,
		tempVector1.z,
		tempVector2.x,
		tempVector2.y,
		tempVector2.z
	);
	resonanceAudioScene.setListenerPosition(
		camera.position.x,
		camera.position.y,
		camera.position.z,
	);
});

class Note {
	constructor(audioElement, source) {
		this.audioElement = audioElement;
		this.source = source;
	}

	setLocationAndPlay(vector3) {
		this.source.setPosition(vector3.x, vector3.y, vector3.z);
		this.audioElement.play();
	}
}

for (const filename of fileNames) {
	const audioElement = document.createElement('audio');
	audioElement.src = filename;
	const audioElementSource = audioContext.createMediaElementSource(audioElement);
	const source = resonanceAudioScene.createSource();
	audioElementSource.connect(source.input);

	const note = new Note(audioElement, source);
	notes.set(filename, note);
}

export function playRandomNote(positionRelativeToHead) {
	const index = Math.floor(Math.random() * fileNames.length);
	const note = notes.get(fileNames[index]);
	note.setLocationAndPlay(positionRelativeToHead);
}
