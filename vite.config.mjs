// vite.config.mjs
import { defineConfig } from 'vite';
import RubyPlugin   from 'vite-plugin-ruby';
import glsl         from 'vite-plugin-glsl';

export default defineConfig({
  // disable Vite’s own public/ copy step
  publicDir: false,

  build: {
    outDir: 'assets',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        application: 'assets/js/app.js'
      }
    }
  },

  plugins: [
    RubyPlugin({
      // only bundle this JS file (adjust path as needed)
      publicOutputDir: 'assets',    // <-- matches Vite’s outDir
      input: ['assets/js/app.js']
    }),
    glsl()
  ],
});



// import { defineConfig } from 'vite'
// import glsl from 'vite-plugin-glsl';
// // import path from 'path'

// // const dirname = path.resolve()

// export default defineConfig({
//   plugins: [ glsl() ]
// })


// export default defineConfig({
//     root: 'sources',
//     publicDir: '../public',
//     build:
//     {
//         outDir: '../dist',
//         emptyOutDir: true,
//         sourcemap: true
//     },
//     plugins: [glsl()]
// })