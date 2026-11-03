// TODO (Paso 1 y Paso 4.1): Importar el runtime de ZeroC Ice ("../../lib/Ice.min.js"),
// el contrato generado por slice2js ("./ChessService.js") y la clase ChessRealtimeObserver.
import "../../lib/Ice.min.js";
import "./ChessService.js";
import { ChessRealtimeObserver } from "./chessRealtimeObserver.js";

/**
 * Servicio de comunicación RPC con ZeroC Ice sobre WebSockets.
 * Encapsula el ciclo de vida del Communicator, el proxy de ChessService
 * y la suscripción en tiempo real mediante ChessRealtimeObserver.
 */

export class ChessClientService {
    constructor() {
        // TODO (Paso 4.1): Inicializar las referencias a window.Ice, window.ChessApp y el estado
        // interno del servicio (communicator, service, realtimeObserver, isConnected, nickname,
        // currentRoomCode, role, assignedColor).

        // Paso 4.1: referencias a los espacios de nombres globales y estado interno.
        this.Ice = window.Ice;
        this.ChessApp = window.ChessApp;

        this.communicator = null;
        this.service = null;
        this.realtimeObserver = null;
        this.isConnected = false;

        this.nickname = null;
        this.currentRoomCode = null;
        this.role = null;
        this.assignedColor = null;
    }

    validateRuntime() {
        // TODO (Paso 4.1): Verificar que window.Ice y window.ChessApp estén disponibles;
        // en caso contrario lanzar un Error descriptivo.
        
        // Paso 4.1: si Ice.min.js o ChessService.js no cargaron, lanzar un error descriptivo.
        if (!window.Ice) {
            throw new Error("El runtime de ZeroC Ice (window.Ice) no está disponible. Revisa lib/Ice.min.js.");
        }
        if (!window.ChessApp) {
            throw new Error(
                "El contrato Slice (window.ChessApp) no está disponible. " +
                "Genera src/services/ChessService.js con slice2js."
            );
        }
        // Se refrescan por si el módulo se instanció antes de que cargaran los scripts
        this.Ice = window.Ice;
        this.ChessApp = window.ChessApp;
    }

    async connect(host, port, nickname) {
        // TODO (Paso 4.2):

        // 1. Validar el runtime y destruir cualquier communicator previo.
        this.validateRuntime();
        if (this.communicator) {
            try {
                await this.communicator.destroy();
            } catch (e) {
                console.warn("Error destruyendo el communicator previo:", e);
            }
            this.communicator = null;
            this.service = null;
            this.isConnected = false;
        }

        // 2. Crear Ice.InitializationData(), configurar Ice.MessageSizeMax = "2048",
        //    Ice.ACM.Client.Timeout = "0" e Ice.ACM.Client.Heartbeat = "3".
        const initData = new this.Ice.InitializationData();
        initData.properties = this.Ice.createProperties();
        initData.properties.setProperty("Ice.MessageSizeMax", "2048");   // KB
        initData.properties.setProperty("Ice.ACM.Client.Timeout", "0");  // no cerrar por inactividad
        initData.properties.setProperty("Ice.ACM.Client.Heartbeat", "3"); // heartbeat esta siempre activo (mantiene la conexión BiDir)

        // 3. Inicializar this.communicator = this.Ice.initialize(initData).
        this.communicator = this.Ice.initialize(initData);

        try {

        // 4. Construir el proxy WebSocket `ChessService:ws -h ${targetHost} -p ${targetPort}`
        //    y obtener this.service mediante await this.ChessApp.ChessServicePrx.checkedCast(base).
        const targetHost = (host && String(host).trim()) || "127.0.0.1";
            const targetPort = (port && String(port).trim()) || "10002";
            const base = this.communicator.stringToProxy(`ChessService:ws -h ${targetHost} -p ${targetPort}`);
            this.service = await this.ChessApp.ChessServicePrx.checkedCast(base);
            if (!this.service) {
                throw new Error(`El proxy en ws://${targetHost}:${targetPort} no es un ChessService.`);
            }
        } catch (err) {
            // Si falla, no dejar un communicator a medias.
            try { await this.communicator.destroy(); } catch (_) { /* ignorar */ }
            this.communicator = null;
            this.service = null;
            this.isConnected = false;
            throw err;
        }

        // 5. Instanciar this.realtimeObserver = new ChessRealtimeObserver(this.Ice, this.ChessApp)
        //    y marcar this.isConnected = true.
        this.nickname = nickname;
        this.realtimeObserver = new ChessRealtimeObserver(this.Ice, this.ChessApp);
        this.isConnected = true;
    }

    async getLobbyData() {
        // TODO (Paso 4.3): Consultar concurrentemente getActiveRooms() y getLeaderboard()
        // en el servidor y retornar { rooms, leaderboard }.
        
        // Las dos consultas son independientes -> se lanzan en paralelo.
        this.ensureConnected();
        const [rooms, leaderboard] = await Promise.all([
            this.service.getActiveRooms(),
            this.service.getLeaderboard()
        ]);
        return { rooms, leaderboard };
    }

    async createRoom(nickname) {
        this.ensureConnected();
        // Se usa el nickname con el que se conectó el cliente.
        return await this.service.createRoom(this.nickname);
    }

    async joinRoom(roomCode, nickname) {
        // TODO (Paso 4.3): Normalizar el código de sala en mayúsculas, invocar
        // joinRoom(normalizedCode, this.nickname), actualizar this.currentRoomCode,
        // this.role y this.assignedColor, y retornar el JoinRoomResult.
        this.ensureConnected();
        const normalizedCode = String(roomCode).trim().toUpperCase();
        const result = await this.service.joinRoom(normalizedCode, this.nickname);

        // Solo se guarda el estado de sala si el servidor aceptó el ingreso (si lanza, no se llega aquí).
        this.currentRoomCode = normalizedCode;
        this.role = result.role;
        this.assignedColor = result.assignedColor;
        return result;
    }

    async subscribeToRoom(listeners = {}) {
        // Paso 4.4: la lógica BiDir siempre esta en ChessRealtimeObserver.
        this.ensureConnected();
        await this.realtimeObserver.subscribe(
            this.communicator,
            this.service,
            this.currentRoomCode,
            this.nickname,
            listeners
        );
    }

    async makeMove(fromRow, fromCol, toRow, toCol) {
        // TODO (Paso 4.4): Instanciar dos objetos this.ChessApp.Position(row, col)
        // e invocar await this.service.makeMove(this.currentRoomCode, this.nickname, fromPos, toPos).
        this.ensureConnected();
        const fromPos = new this.ChessApp.Position(fromRow, fromCol);
        const toPos = new this.ChessApp.Position(toRow, toCol);
        return await this.service.makeMove(this.currentRoomCode, this.nickname, fromPos, toPos);
    }

    async resign() {
        // TODO (Paso 4.4): Invocar await this.service.resign(this.currentRoomCode, this.nickname).
        this.ensureConnected();
        await this.service.resign(this.currentRoomCode, this.nickname); 
    }

    async leaveRoom() {
        // TODO (Paso 4.4): Desuscribir this.realtimeObserver, invocar
        // await this.service.leaveRoom(this.currentRoomCode, this.nickname) y limpiar el estado de sala actual.
        
        if (!this.isConnected || !this.currentRoomCode) {
            return;
        }
        const roomCode = this.currentRoomCode;
        try {
            // Primero se corta el flujo push y se libera el adaptador local.
            if (this.realtimeObserver) {
                await this.realtimeObserver.unsubscribe(this.service, roomCode, this.nickname);
            }
            await this.service.leaveRoom(roomCode, this.nickname);
        } catch (err) {
            console.warn("Error al abandonar la sala:", err);
        } finally {
            // Pase lo que pase, el cliente ya no está en la sala.
            this.currentRoomCode = null;
            this.role = null;
            this.assignedColor = null;
        }
    }

    ensureConnected() {
        // TODO: Verificar que el cliente esté conectado antes de realizar llamadas RPC.
        if (!this.isConnected || !this.service) {
            throw new Error("No hay conexión con el servidor Ice. Conéctate primero.");
        }
    }
}
