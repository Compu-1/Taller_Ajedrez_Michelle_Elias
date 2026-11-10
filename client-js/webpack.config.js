const fs = require("fs");
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

/**
 * Build de producción del cliente Web para desplegar con nginx.
 * Genera dist/index.html y dist/assets/ (bundle JS con Ice.min.js y ChessService.js, y estilos).
 */

// Se reutiliza index.html: el bundle lo inyecta el plugin y los estilos se sirven desde assets/.
const indexTemplate = fs.readFileSync(path.resolve(__dirname, "index.html"), "utf8")
    .replace(/\s*<script[^>]*src="src\/app\.js"[^>]*><\/script>/, "")
    .replace('href="styles.css"', 'href="assets/styles.css"');

module.exports = {
    mode: "production",
    entry: "./src/app.js",
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "assets/app.[contenthash:8].js",
        clean: true
    },
    plugins: [
        new HtmlWebpackPlugin({
            templateContent: indexTemplate,
            inject: "body",
            scriptLoading: "module"
        }),
        new CopyWebpackPlugin({
            patterns: [{ from: "styles.css", to: "assets/styles.css" }]
        })
    ],
    // ChessService.js (generado por slice2js) menciona `require` solo para Node.js;
    // en el navegador usa window.Ice._require, así que el aviso no aplica.
    ignoreWarnings: [{ module: /ChessService\.js$/, message: /Critical dependency/ }],
    performance: {
        // Ice.min.js pesa más que el límite recomendado por webpack
        hints: false
    }
};
