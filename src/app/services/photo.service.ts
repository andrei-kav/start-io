import { Injectable } from '@angular/core';
import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { Platform } from '@ionic/angular';
import {Capacitor} from "@capacitor/core";

export interface UserPhoto {
  filepath: string;
  webviewPath?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PhotoService {

  private photos: UserPhoto[] = []
  // a constant variable that acts as the key for the store
  private PHOTO_STORAGE: string = 'photos'
  private platform: Platform

  constructor(platform: Platform) {
    this.platform = platform;
  }

  getPhotos(): UserPhoto[] {
    return this.photos
  }

  async addNewToGallery() {
    // Take a photo
    const capturedPhoto = await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      quality: 100
    });

    // Save the picture and add it to photo collection
    const savedImageFile = await this.savePicture(capturedPhoto);
    this.photos.unshift(savedImageFile)

    await Preferences.set({
      key: this.PHOTO_STORAGE,
      value: JSON.stringify(this.photos),
    });
  }

  async loadSaved() {
    // Retrieve cached photo array data
    const { value } = await Preferences.get({ key: this.PHOTO_STORAGE });
    this.photos = (value ? JSON.parse(value) : []) as UserPhoto[];

    // Easiest way to detect when running on the web:
    // “when the platform is NOT hybrid, do this”
    if (!this.platform.is('hybrid')) {
      // t.i. only for web
      // bc only the web requires reading each image from the Filesystem into base64 format
      // Display the photo by reading into base64 format
      for (let photo of this.photos) {
        // Read each saved photo's data from the Filesystem
        const readFile = await Filesystem.readFile({
          path: photo.filepath,
          directory: Directory.Data
        });

        // Web platform only: Load the photo as base64 data
        photo.webviewPath = `data:image/jpeg;base64,${readFile.data}`;
      }
    }
  }

  async savePicture(capturedPhoto: Photo): Promise<UserPhoto> {
    // use Capacitor Filesystem API to save the photo to the filesystem
    // Convert photo to base64 format, required by Filesystem API to save
    const base64Data = await this.readAsBase64(capturedPhoto);

    // Write the file to the data directory
    const fileName = `photo_${Date.now()} + .jpeg`;
    const savedFile = await Filesystem.writeFile({
      path: fileName,
      data: base64Data,
      directory: Directory.Data
    });

    if (this.platform.is('hybrid')) {
      // mobile format
      // Display the new image by rewriting the 'file://' path to HTTP
      // Details: https://ionicframework.com/docs/building/webview#file-protocol
      return {
        filepath: savedFile.uri,
        webviewPath: Capacitor.convertFileSrc(savedFile.uri),
      };
    }
    else {
      // web format
      // Use webPath to display the new image instead of base64 since it's
      // already loaded into memory
      return {
        filepath: fileName,
        webviewPath: capturedPhoto.webPath
      };
    }
  }

  async deletePicture(photo: UserPhoto, position: number) {
    // Remove this photo from the Photos reference data array
    this.photos.splice(position, 1);

    // Then use the Capacitor Preferences API to update the cached version of the Photos array
    Preferences.set({
      key: this.PHOTO_STORAGE,
      value: JSON.stringify(this.photos)
    });

    // delete photo file from filesystem
    const filename = photo.filepath
      .substr(photo.filepath.lastIndexOf('/') + 1);

    await Filesystem.deleteFile({
      path: filename,
      directory: Directory.Data
    });
  }

  private async readAsBase64(photo: Photo): Promise<string | Blob> {
    // "hybrid" will detect Cordova or Capacitor
    if (this.platform.is('hybrid')) {
      // mobile format
      // Read the file into base64 format
      const file = await Filesystem.readFile({
        path: photo.path!
      });

      return file.data;
    } else {
      // web format
      // Fetch the photo, read as a blob, then convert to base64 format
      const response = await fetch(photo.webPath!)
      const blob = await response.blob()

      return await this.convertBlobToBase64(blob) as string
    }
  }

  private convertBlobToBase64 = (blob: Blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}
