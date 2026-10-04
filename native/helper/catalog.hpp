// native/helper/catalog.hpp
// Astral Vanguard v3.0 - Closed Action Catalog & Strict Parameter Validation

#pragma once

#include <windows.h>
#include <shlobj.h>
#include <string>
#include <vector>
#include <regex>
#include <sstream>

typedef BOOL(WINAPI* DnsFlushResolverCacheFunc)(VOID);

class ActionCatalog {
public:
    static bool IsElevated() {
        BOOL isMember = FALSE;
        SID_IDENTIFIER_AUTHORITY ntAuthority = SECURITY_NT_AUTHORITY;
        PSID adminGroup = NULL;
        if (AllocateAndInitializeSid(&ntAuthority, 2, SECURITY_BUILTIN_DOMAIN_RID,
            DOMAIN_ALIAS_RID_ADMINS, 0, 0, 0, 0, 0, 0, &adminGroup)) {
            CheckTokenMembership(NULL, adminGroup, &isMember);
            FreeSid(adminGroup);
        }
        return isMember == TRUE;
    }

    static std::string ExtractJsonField(const std::string& json, const std::string& key) {
        std::string searchKey = "\"" + key + "\"";
        size_t pos = json.find(searchKey);
        if (pos == std::string::npos) return "";

        size_t colonPos = json.find(':', pos + searchKey.length());
        if (colonPos == std::string::npos) return "";

        size_t startVal = json.find_first_not_of(" \t\r\n", colonPos + 1);
        if (startVal == std::string::npos) return "";

        if (json[startVal] == '\"') {
            size_t endQuote = json.find('\"', startVal + 1);
            if (endQuote == std::string::npos) return "";
            return json.substr(startVal + 1, endQuote - startVal - 1);
        } else if (json[startVal] == '{' || json[startVal] == '[') {
            return "{}";
        } else {
            size_t endVal = json.find_first_of(",}\r\n", startVal);
            if (endVal == std::string::npos) endVal = json.length();
            return json.substr(startVal, endVal - startVal);
        }
    }

    static std::string HandleGetStatus() {
        bool elevated = IsElevated();
        DWORD pid = GetCurrentProcessId();

        std::ostringstream ss;
        ss << "{"
           << "\"success\":true,"
           << "\"helperVersion\":\"3.0.0\","
           << "\"isElevated\":" << (elevated ? "true" : "false") << ","
           << "\"pid\":" << pid << ","
           << "\"actions\":[\"GET_HELPER_STATUS\",\"FLUSH_DNS\",\"SET_DNS_PROVIDER\",\"DISABLE_STARTUP_ENTRY\"]"
           << "}";
        return ss.str();
    }

    static std::string HandleFlushDns() {
        bool flushed = false;

        // Tenter via dnsapi.dll DnsFlushResolverCache
        HMODULE hDnsApi = LoadLibraryW(L"dnsapi.dll");
        if (hDnsApi) {
            DnsFlushResolverCacheFunc pFlush = reinterpret_cast<DnsFlushResolverCacheFunc>(
                GetProcAddress(hDnsApi, "DnsFlushResolverCache"));
            if (pFlush) {
                flushed = (pFlush() == TRUE);
            }
            FreeLibrary(hDnsApi);
        }

        // Si DnsFlushResolverCache indisponible, execution directe de ipconfig sans shell
        if (!flushed) {
            STARTUPINFOW si = { sizeof(si) };
            PROCESS_INFORMATION pi = { 0 };
            si.dwFlags = STARTF_USESHOWWINDOW;
            si.wShowWindow = SW_HIDE;

            wchar_t cmd[] = L"C:\\Windows\\System32\\ipconfig.exe /flushdns";
            if (CreateProcessW(NULL, cmd, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
                WaitForSingleObject(pi.hProcess, 5000);
                DWORD exitCode = 0;
                GetExitCodeProcess(pi.hProcess, &exitCode);
                CloseHandle(pi.hProcess);
                CloseHandle(pi.hThread);
                flushed = (exitCode == 0);
            }
        }

        std::ostringstream ss;
        ss << "{"
           << "\"success\":" << (flushed ? "true" : "false") << ","
           << "\"action\":\"FLUSH_DNS\","
           << "\"message\":\"" << (flushed ? "Cache DNS vide avec succes." : "Echec de vidage du cache DNS.") << "\""
           << "}";
        return ss.str();
    }

    static std::string HandleSetDns(const std::string& payload) {
        std::string provider = ExtractJsonField(payload, "provider");

        // LISTE BLANCHE STRICTE : Rejeter tout ce qui n'est pas dans la liste
        std::string primaryIp;
        std::string secondaryIp;
        bool isDhcp = false;

        if (provider == "cloudflare") {
            primaryIp = "1.1.1.1";
            secondaryIp = "1.0.0.1";
        } else if (provider == "google") {
            primaryIp = "8.8.8.8";
            secondaryIp = "8.8.4.4";
        } else if (provider == "quad9") {
            primaryIp = "9.9.9.9";
            secondaryIp = "149.112.112.112";
        } else if (provider == "opendns") {
            primaryIp = "208.67.222.222";
            secondaryIp = "208.67.220.220";
        } else if (provider == "auto") {
            isDhcp = true;
        } else {
            return "{\"success\":false,\"error\":\"Fournisseur DNS non autorise dans la liste blanche.\",\"errorCode\":\"INVALID_DNS_PROVIDER\"}";
        }

        // Application via netsh sans shell CMD
        // Pour les interfaces actives, configurer l'adresse DNS
        std::vector<std::wstring> interfaces = { L"Wi-Fi", L"Ethernet" };

        for (const auto& iface : interfaces) {
            STARTUPINFOW si = { sizeof(si) };
            PROCESS_INFORMATION pi = { 0 };
            si.dwFlags = STARTF_USESHOWWINDOW;
            si.wShowWindow = SW_HIDE;

            wchar_t cmdLine[512] = { 0 };
            if (isDhcp) {
                swprintf_s(cmdLine, L"C:\\Windows\\System32\\netsh.exe interface ip set dns name=\"%s\" dhcp", iface.c_str());
            } else {
                swprintf_s(cmdLine, L"C:\\Windows\\System32\\netsh.exe interface ip set dns name=\"%s\" static %S validate=no", iface.c_str(), primaryIp.c_str());
            }

            if (CreateProcessW(NULL, cmdLine, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
                WaitForSingleObject(pi.hProcess, 4000);
                CloseHandle(pi.hProcess);
                CloseHandle(pi.hThread);

                if (!isDhcp && !secondaryIp.empty()) {
                    wchar_t cmdLine2[512] = { 0 };
                    swprintf_s(cmdLine2, L"C:\\Windows\\System32\\netsh.exe interface ip add dns name=\"%s\" %S index=2 validate=no", iface.c_str(), secondaryIp.c_str());
                    PROCESS_INFORMATION pi2 = { 0 };
                    STARTUPINFOW si2 = { sizeof(si2) };
                    si2.dwFlags = STARTF_USESHOWWINDOW;
                    si2.wShowWindow = SW_HIDE;
                    if (CreateProcessW(NULL, cmdLine2, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si2, &pi2)) {
                        WaitForSingleObject(pi2.hProcess, 4000);
                        CloseHandle(pi2.hProcess);
                        CloseHandle(pi2.hThread);
                    }
                }
            }
        }

        std::ostringstream ss;
        ss << "{"
           << "\"success\":true,"
           << "\"action\":\"SET_DNS_PROVIDER\","
           << "\"provider\":\"" << provider << "\","
           << "\"isDhcp\":" << (isDhcp ? "true" : "false") << ","
           << "\"servers\":[\"" << primaryIp << "\",\"" << secondaryIp << "\"]"
           << "}";
        return ss.str();
    }

    static std::string HandleDisableStartup(const std::string& payload) {
        std::string hive = ExtractJsonField(payload, "hive");
        std::string entryName = ExtractJsonField(payload, "entryName");

        // Validation stricte du hive
        if (hive != "HKCU" && hive != "HKLM") {
            return "{\"success\":false,\"error\":\"Ruche de registre invalide (HKCU ou HKLM uniquement).\",\"errorCode\":\"INVALID_HIVE\"}";
        }

        // Validation stricte du nom d'entree : caracteres alphanumeriques, tiret, soulignement, point, espace
        if (entryName.empty() || entryName.length() > 128) {
            return "{\"success\":false,\"error\":\"Nom d'entree vide ou trop long.\",\"errorCode\":\"INVALID_ENTRY_NAME\"}";
        }

        std::regex validEntryRegex("^[a-zA-Z0-9_\\-\\.\\s]{1,128}$");
        if (!std::regex_match(entryName, validEntryRegex)) {
            return "{\"success\":false,\"error\":\"Caracteres interdits dans le nom d'entree.\",\"errorCode\":\"INVALID_CHARS\"}";
        }

        HKEY hRoot = (hive == "HKLM") ? HKEY_LOCAL_MACHINE : HKEY_CURRENT_USER;
        HKEY hKey = NULL;
        LPCWSTR subKey = L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run";

        LSTATUS status = RegOpenKeyExW(hRoot, subKey, 0, KEY_SET_VALUE | KEY_QUERY_VALUE, &hKey);
        if (status != ERROR_SUCCESS) {
            return "{\"success\":false,\"error\":\"Impossible d'ouvrir la cle Run du registre.\",\"errorCode\":\"REG_OPEN_FAILED\"}";
        }

        int wLen = MultiByteToWideChar(CP_UTF8, 0, entryName.c_str(), -1, NULL, 0);
        std::vector<wchar_t> wEntry(wLen);
        MultiByteToWideChar(CP_UTF8, 0, entryName.c_str(), -1, wEntry.data(), wLen);

        LSTATUS delStatus = RegDeleteValueW(hKey, wEntry.data());
        RegCloseKey(hKey);

        bool deleted = (delStatus == ERROR_SUCCESS);
        bool notFound = (delStatus == ERROR_FILE_NOT_FOUND);

        std::ostringstream ss;
        ss << "{"
           << "\"success\":" << ((deleted || notFound) ? "true" : "false") << ","
           << "\"action\":\"DISABLE_STARTUP_ENTRY\","
           << "\"hive\":\"" << hive << "\","
           << "\"entryName\":\"" << entryName << "\","
           << "\"deleted\":" << (deleted ? "true" : "false") << ","
           << "\"notFound\":" << (notFound ? "true" : "false")
           << "}";
        return ss.str();
    }

    static std::string Dispatch(const std::string& actionId, const std::string& payload) {
        if (actionId == "GET_HELPER_STATUS") {
            return HandleGetStatus();
        } else if (actionId == "FLUSH_DNS") {
            return HandleFlushDns();
        } else if (actionId == "SET_DNS_PROVIDER") {
            return HandleSetDns(payload);
        } else if (actionId == "DISABLE_STARTUP_ENTRY") {
            return HandleDisableStartup(payload);
        } else {
            // REFUS STRICT DE TOUTE COMMANDE INCONNUE OU NON HOMOLOGUÉE
            return "{\"success\":false,\"error\":\"Action non reconnue dans le catalogue ferme du Helper Astral Vanguard.\",\"errorCode\":\"UNKNOWN_ACTION\"}";
        }
    }
};
