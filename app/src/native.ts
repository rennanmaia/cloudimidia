import { NativeEventEmitter, NativeModules } from 'react-native'

export type DeviceConfig = {
  serverUrl: string
  autostart: boolean
  homeEnabled: boolean
  canLaunchFromBackground: boolean
  needsOverlayPermission: boolean
  needsInstallPermission: boolean
  appVersion: string
  appVersionCode: number
  playerVersion: string
  localPort: number
}

export type Diagnostics = Record<string, string | number | boolean | string[] | null>

type CloudiDeviceModule = {
  getConfig(): Promise<DeviceConfig>
  setServerUrl(url: string): Promise<void>
  setAutostart(on: boolean): Promise<boolean>
  setHomeEnabled(on: boolean): Promise<boolean>
  openSystemSettings(kind: 'overlay' | 'install' | 'settings' | 'wifi' | 'home' | 'app'): Promise<boolean>
  syncMedia(urls: string[]): Promise<number>
  clearMedia(): Promise<void>
  updatePlayerBundle(files: { path: string; url: string }[], version: string): Promise<string>
  resetPlayerBundle(): Promise<void>
  installApk(url: string): Promise<boolean>
  restartApp(): void
  exitApp(): void
  logEvent(msg: string): void
  focusView(tag: number): void
  captureScreen(): Promise<string>
  getDiagnostics(): Promise<Diagnostics>
}

export const Device: CloudiDeviceModule = NativeModules.CloudiDevice
export const deviceEvents = new NativeEventEmitter(NativeModules.CloudiDevice)
