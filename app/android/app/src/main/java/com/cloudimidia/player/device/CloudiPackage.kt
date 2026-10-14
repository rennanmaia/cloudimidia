package com.cloudimidia.player.device

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class CloudiPackage : ReactPackage {
    override fun createNativeModules(rc: ReactApplicationContext): List<NativeModule> = listOf(CloudiDeviceModule(rc))
    override fun createViewManagers(rc: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
