plugins { id("com.android.application") }
android {
    namespace = "io.github.bichengili.codexgo"
    compileSdk = 34
    defaultConfig {
        applicationId = "io.github.bichengili.codexgo"
        minSdk = 26
        // Private executable userspace needs the legacy exec policy. Sideload build.
        targetSdk = 28
        versionCode = 2
        versionName = "0.2.0"
        ndk { abiFilters += "arm64-v8a" }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    packaging { jniLibs { useLegacyPackaging = true } }
    // The userspace and source archives are already compressed; avoid a second
    // compression pass that can exhaust the build worker's heap.
    androidResources { noCompress += listOf("tgz", "zip") }
    buildTypes { getByName("release") { isMinifyEnabled = false } }
    // This is a sideloaded private runtime; Play's target policy is inapplicable.
    lint { disable += "ExpiredTargetSdkVersion" }
}
tasks.withType<JavaCompile>().configureEach { options.encoding = "UTF-8" }
