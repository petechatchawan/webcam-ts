export interface MediaDevicesPort {
  open(constraints: MediaStreamConstraints): Promise<MediaStream>;
  enumerateDevices(): Promise<MediaDeviceInfo[]>;
  subscribeDeviceChange?(listener: () => void): () => void;
}
