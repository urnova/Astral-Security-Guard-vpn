// native/helper/main.cpp
// Astral Vanguard v3.0 - Privileged Helper Executable
// Ultra-secure, minimal, on-demand, no GUI, no shell execution.

#include <windows.h>
#include <iostream>
#include <string>
#include <chrono>
#include <thread>
#include "security.hpp"
#include "catalog.hpp"

// Timeout de securite : 8 secondes max par defaut
constexpr DWORD HELPER_DEFAULT_LIFETIME_MS = 8000;
DWORD g_watchdogMs = HELPER_DEFAULT_LIFETIME_MS;

void WatchdogTimer(HANDLE hPipe) {
    std::this_thread::sleep_for(std::chrono::milliseconds(g_watchdogMs));
    if (hPipe != INVALID_HANDLE_VALUE) {
        CancelIoEx(hPipe, NULL);
        CloseHandle(hPipe);
    }
    TerminateProcess(GetCurrentProcess(), 0);
}

int wmain(int argc, wchar_t* argv[]) {
    // 1. Analyse des arguments de ligne de commande
    // Mode client IPC (utilise pour se connecter avec le masque exact 0x00120183)
    if (argc >= 2 && (std::wstring(argv[1]) == L"client" || std::wstring(argv[1]) == L"--client")) {
        std::wstring clientPipe;
        for (int i = 2; i < argc; ++i) {
            std::wstring a = argv[i];
            if (a == L"--pipe" && i + 1 < argc) clientPipe = argv[++i];
        }
        if (clientPipe.empty()) {
            std::cerr << "{\"success\":false,\"error\":\"Argument --pipe manquant en mode client.\"}" << std::endl;
            return 1;
        }

        // Lire la requete JSON depuis stdin
        std::string request;
        std::string line;
        while (std::getline(std::cin, line)) {
            request += line + "\n";
        }

        if (request.empty()) {
            std::cerr << "{\"success\":false,\"error\":\"Requete stdin vide.\"}" << std::endl;
            return 2;
        }

        // Connexion avec le masque minimal exact 0x00120183
        HANDLE hFile = CreateFileW(
            clientPipe.c_str(),
            CLIENT_MINIMAL_PIPE_ACCESS, // 0x00120183
            0,
            NULL,
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL,
            NULL
        );

        if (hFile == INVALID_HANDLE_VALUE) {
            DWORD err = GetLastError();
            std::cerr << "{\"success\":false,\"error\":\"Echec connexion pipe\",\"win32Error\":" << err << "}" << std::endl;
            return 3;
        }

        DWORD written = 0;
        WriteFile(hFile, request.c_str(), static_cast<DWORD>(request.length()), &written, NULL);
        FlushFileBuffers(hFile);

        std::vector<char> respBuf(65536);
        DWORD bytesRead = 0;
        BOOL ok = ReadFile(hFile, respBuf.data(), static_cast<DWORD>(respBuf.size() - 1), &bytesRead, NULL);
        CloseHandle(hFile);

        if (!ok || bytesRead == 0) {
            std::cerr << "{\"success\":false,\"error\":\"Echec lecture reponse pipe.\"}" << std::endl;
            return 4;
        }

        respBuf[bytesRead] = '\0';
        std::cout << respBuf.data() << std::endl;
        return 0;
    }

    std::wstring pipeName;
    DWORD expectedClientPid = 0;
    bool selfTest = false;

    for (int i = 1; i < argc; ++i) {
        std::wstring arg = argv[i];
        if (arg == L"--pipe" && i + 1 < argc) {
            pipeName = argv[++i];
        } else if (arg == L"--client-pid" && i + 1 < argc) {
            expectedClientPid = static_cast<DWORD>(_wtoi(argv[++i]));
        } else if (arg == L"--timeout" && i + 1 < argc) {
            int t = _wtoi(argv[++i]);
            if (t >= 100 && t <= 60000) {
                g_watchdogMs = static_cast<DWORD>(t);
            }
        } else if (arg == L"--self-test") {
            selfTest = true;
        } else if (arg == L"--version") {
            std::cout << "AstralVanguardHelper 3.0.0" << std::endl;
            return 0;
        }
    }

    if (selfTest) {
        std::cout << "ASTRAL_HELPER_SELF_TEST_OK" << std::endl;
        std::cout << "CLIENT_MINIMAL_PIPE_ACCESS=0x" << std::hex << CLIENT_MINIMAL_PIPE_ACCESS << std::dec << std::endl;
        std::cout << "FORBIDDEN_BIT_0x0004_EXCLUDED=" << (((CLIENT_MINIMAL_PIPE_ACCESS & FORBIDDEN_PIPE_MASK_BIT) == 0) ? "true" : "false") << std::endl;
        std::cout << "IS_ELEVATED=" << (ActionCatalog::IsElevated() ? "true" : "false") << std::endl;
        return 0;
    }

    if (pipeName.empty()) {
        std::cerr << "Erreur: Argument --pipe manquant." << std::endl;
        return 1;
    }

    // Le nom de pipe doit imperativement respecter le prefixe securise
    if (pipeName.find(L"\\\\.\\pipe\\astral-vanguard-") != 0 &&
        pipeName.find(L"\\\\.\\pipe\\AstralVanguard_") != 0) {
        std::cerr << "Erreur: Nom de pipe non autorise." << std::endl;
        return 2;
    }

    // 2. Construction de la DACL restreinte au TokenLogonSid de session et SYSTEM
    SECURITY_DESCRIPTOR sd;
    SECURITY_ATTRIBUTES sa;
    PACL pDacl = NULL;

    if (!PipeSecurityHelper::CreateLogonRestrictedSecurityAttributes(&sa, &sd, &pDacl)) {
        std::cerr << "Erreur: Impossible d'initialiser les attributs de securite Win32." << std::endl;
        return 3;
    }

    // 3. Creation du Named Pipe serveur
    // - PIPE_ACCESS_DUPLEX (0x3) | FILE_FLAG_FIRST_PIPE_INSTANCE (0x00080000)
    // - dwPipeMode : PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS (0x00000008)
    // - nMaxInstances = 1
    DWORD dwOpenMode = PIPE_ACCESS_DUPLEX | FILE_FLAG_FIRST_PIPE_INSTANCE;
    DWORD dwPipeMode = PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT | 0x00000008; // PIPE_REJECT_REMOTE_CLIENTS

    HANDLE hPipe = CreateNamedPipeW(
        pipeName.c_str(),
        dwOpenMode,
        dwPipeMode,
        1,       // nMaxInstances = 1
        65536,   // nOutBufferSize
        65536,   // nInBufferSize
        4000,    // nDefaultTimeOut (4s)
        &sa
    );

    if (hPipe == INVALID_HANDLE_VALUE) {
        DWORD err = GetLastError();
        std::cerr << "Erreur Creation Pipe: " << err << std::endl;
        if (pDacl) LocalFree(pDacl);
        return 4;
    }

    // Lancement du thread watchdog pour garantir l'arret du Helper meme en cas de freeze client
    std::thread watchdog(WatchdogTimer, hPipe);
    watchdog.detach();

    // 4. Attente de connexion du client
    BOOL connected = ConnectNamedPipe(hPipe, NULL) ? TRUE : (GetLastError() == ERROR_PIPE_CONNECTED);
    if (!connected) {
        CloseHandle(hPipe);
        if (pDacl) LocalFree(pDacl);
        return 5;
    }

    // 5. Validation de securite du processus client (PID + Chemin binaire)
    if (!PipeSecurityHelper::ValidateClientProcess(hPipe, expectedClientPid)) {
        DisconnectNamedPipe(hPipe);
        CloseHandle(hPipe);
        if (pDacl) LocalFree(pDacl);
        return 6;
    }

    // 6. Lecture du message in-band (max 64KB)
    std::vector<char> buffer(65536);
    DWORD bytesRead = 0;
    BOOL readSuccess = ReadFile(hPipe, buffer.data(), static_cast<DWORD>(buffer.size() - 1), &bytesRead, NULL);

    if (!readSuccess || bytesRead == 0) {
        DisconnectNamedPipe(hPipe);
        CloseHandle(hPipe);
        if (pDacl) LocalFree(pDacl);
        return 7;
    }

    buffer[bytesRead] = '\0';
    std::string requestJson(buffer.data(), bytesRead);

    // 7. Validation du format et du nonce in-band
    std::string nonce = ActionCatalog::ExtractJsonField(requestJson, "nonce");
    std::string actionId = ActionCatalog::ExtractJsonField(requestJson, "actionId");

    // Le nonce doit etre non vide
    if (nonce.empty() || nonce.length() < 16) {
        std::string errResp = "{\"success\":false,\"error\":\"Nonce in-band manquant ou invalide.\",\"errorCode\":\"INVALID_NONCE\"}";
        DWORD written = 0;
        WriteFile(hPipe, errResp.c_str(), static_cast<DWORD>(errResp.length()), &written, NULL);
        FlushFileBuffers(hPipe);
        DisconnectNamedPipe(hPipe);
        CloseHandle(hPipe);
        if (pDacl) LocalFree(pDacl);
        return 8;
    }

    // 8. Execution de l'action via le catalogue ferme
    std::string response = ActionCatalog::Dispatch(actionId, requestJson);

    // 9. Envoi de la reponse structuree et fermeture immediate
    DWORD written = 0;
    WriteFile(hPipe, response.c_str(), static_cast<DWORD>(response.length()), &written, NULL);
    FlushFileBuffers(hPipe);

    DisconnectNamedPipe(hPipe);
    CloseHandle(hPipe);
    if (pDacl) LocalFree(pDacl);

    // Arrêt immédiat après action
    return 0;
}
