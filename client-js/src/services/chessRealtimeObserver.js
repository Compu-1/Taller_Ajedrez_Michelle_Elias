/**
 * Gestor de actualizaciones en tiempo real para el cliente Web mediante
 * Conexiones Bidireccionales (BiDir) sobre WebSockets en ZeroC Ice.
 * Implementa el servant ChessObserver en el navegador sin usar polling.
 */

export class ChessRealtimeObserver {
    constructor(Ice, ChessApp) {
        this.Ice = Ice;
        this.ChessApp = ChessApp;
        this.adapter = null;
        this.identity = null;
        this.onStateChangedCallback = null;
        this.onGameFinishedCallback = null;
    }

    /**
     * Crea el servant de ChessObserver, configura el ObjectAdapter bidireccional
     * sobre la conexión WebSocket activa y registra el observador en la sala.
     */
    async subscribe(communicator, servicePrx, roomCode, nickname, { onStateChanged, onGameFinished } = {}) {
        // Paso 3.1: Limpiar adaptador previo y guardar callbacks
        await this.cleanupAdapter();
        this.onStateChangedCallback = onStateChanged || null;
        this.onGameFinishedCallback = onGameFinished || null;

        // Paso 3.2: Servant que recibe los eventos push del servidor
        const observer = this;
        class WebChessObserverServant extends this.ChessApp.ChessObserver {
            onGameStateChanged(newState, _current) {
                if (observer.onStateChangedCallback) {
                    observer.onStateChangedCallback(newState);
                }
            }

            onGameFinished(finalState, winnerNickname, pointsDelta, _current) {
                if (observer.onGameFinishedCallback) {
                    observer.onGameFinishedCallback(finalState, winnerNickname, pointsDelta);
                }
            }
        }

        // Paso 3.3: Adaptador sin endpoints (el navegador no puede escuchar puertos)
        this.adapter = await communicator.createObjectAdapter("");
        this.identity = new this.Ice.Identity(this.Ice.generateUUID(), "ChessObserver");
        const proxy = this.adapter.add(new WebChessObserverServant(), this.identity);
        await this.adapter.activate();

        // Paso 3.4: Asociar el adaptador a la conexión WebSocket y registrar el observador
        const connection = await servicePrx.ice_getConnection();
        connection.setAdapter(this.adapter);
        const observerPrx = this.ChessApp.ChessObserverPrx.uncheckedCast(proxy);
        await servicePrx.registerObserver(roomCode, nickname, observerPrx);
    }

    /**
     * Desvincula el observador de la sala en el servidor y limpia el adaptador local.
     */
    async unsubscribe(servicePrx, roomCode, nickname) {
        // Paso 3.5: Limpiar callbacks, notificar al servidor y liberar el adaptador
        this.onStateChangedCallback = null;
        this.onGameFinishedCallback = null;

        if (servicePrx && roomCode) {
            try {
                await servicePrx.unregisterObserver(roomCode, nickname);
            } catch (err) {
                console.warn("Error al desregistrar el observador:", err);
            }
        }

        await this.cleanupAdapter();
    }

    async cleanupAdapter() {
        // Paso 3.6: Remover la identidad y destruir el adaptador
        if (this.adapter) {
            try {
                if (this.identity) {
                    this.adapter.remove(this.identity);
                }
                await this.adapter.destroy();
            } catch (err) {
                console.warn("Error al destruir el adaptador del observador:", err);
            }
        }
        this.adapter = null;
        this.identity = null;
    }
}
