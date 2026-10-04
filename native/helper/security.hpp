// native/helper/security.hpp
// Astral Vanguard v3.0 - Win32 Security Descriptor & Process Validation for Named Pipe

#pragma once

#include <windows.h>
#include <sddl.h>
#include <aclapi.h>
#include <psapi.h>
#include <tlhelp32.h>
#include <string>
#include <vector>
#include <algorithm>

// Masque Client Minimal Strict : 0x00120183
// Exclut rigoureusement le bit 0x0004 (FILE_CREATE_PIPE_INSTANCE / FILE_APPEND_DATA),
// ainsi que WRITE_DAC, WRITE_OWNER et DELETE.
constexpr DWORD CLIENT_MINIMAL_PIPE_ACCESS = 0x00120183;
constexpr DWORD FORBIDDEN_PIPE_MASK_BIT = 0x0004;

static_assert((CLIENT_MINIMAL_PIPE_ACCESS & FORBIDDEN_PIPE_MASK_BIT) == 0,
    "CRITICAL: CLIENT_MINIMAL_PIPE_ACCESS must NOT have bit 0x0004 set!");

class PipeSecurityHelper {
public:
    static bool CreateLogonRestrictedSecurityAttributes(SECURITY_ATTRIBUTES* pSa, PSECURITY_DESCRIPTOR pSd, PACL* ppDaclOut) {
        if (!pSa || !pSd || !ppDaclOut) return false;

        // 1. Initialiser le descripteur de securite
        if (!InitializeSecurityDescriptor(pSd, SECURITY_DESCRIPTOR_REVISION)) {
            return false;
        }

        // 2. Extraire le TokenLogonSid du jeton du processus appelant
        HANDLE hToken = NULL;
        if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &hToken)) {
            return false;
        }

        DWORD dwLen = 0;
        GetTokenInformation(hToken, TokenLogonSid, NULL, 0, &dwLen);
        if (GetLastError() != ERROR_INSUFFICIENT_BUFFER || dwLen == 0) {
            CloseHandle(hToken);
            return false;
        }

        std::vector<BYTE> tokenBuffer(dwLen);
        PTOKEN_GROUPS pGroups = reinterpret_cast<PTOKEN_GROUPS>(tokenBuffer.data());
        if (!GetTokenInformation(hToken, TokenLogonSid, pGroups, dwLen, &dwLen)) {
            CloseHandle(hToken);
            return false;
        }
        CloseHandle(hToken);

        if (pGroups->GroupCount == 0) {
            return false;
        }

        PSID pLogonSid = pGroups->Groups[0].Sid;

        // 3. Obtenir le SID LOCAL_SYSTEM (S-1-5-18)
        BYTE systemSidBuffer[SECURITY_MAX_SID_SIZE];
        DWORD cbSystemSid = sizeof(systemSidBuffer);
        PSID pSystemSid = reinterpret_cast<PSID>(systemSidBuffer);
        if (!CreateWellKnownSid(WinLocalSystemSid, NULL, pSystemSid, &cbSystemSid)) {
            return false;
        }

        // 4. Calculer la taille necessaire pour la DACL
        // REGLE CRITIQUE : L'ACE User SID est rigoureusement OMISE pour empecher
        // tout acces depuis les autres sessions du meme compte utilisateur.
        DWORD dwAclSize = sizeof(ACL) +
            (sizeof(ACCESS_ALLOWED_ACE) - sizeof(DWORD) + GetLengthSid(pLogonSid)) +
            (sizeof(ACCESS_ALLOWED_ACE) - sizeof(DWORD) + GetLengthSid(pSystemSid));

        PACL pDacl = static_cast<PACL>(LocalAlloc(LPTR, dwAclSize));
        if (!pDacl) {
            return false;
        }

        if (!InitializeAcl(pDacl, dwAclSize, ACL_REVISION)) {
            LocalFree(pDacl);
            return false;
        }

        // 5. Inserer les deux ACEs d'acces exclusif
        // - TokenLogonSid : Masque minimal strict 0x00120183 (sans bit 0x0004)
        if (!AddAccessAllowedAce(pDacl, ACL_REVISION, CLIENT_MINIMAL_PIPE_ACCESS, pLogonSid)) {
            LocalFree(pDacl);
            return false;
        }

        // - LOCAL_SYSTEM : FILE_ALL_ACCESS (0x001F01FF)
        if (!AddAccessAllowedAce(pDacl, ACL_REVISION, FILE_ALL_ACCESS, pSystemSid)) {
            LocalFree(pDacl);
            return false;
        }

        // 6. Associer la DACL et verouiller contre l'heritage (SE_DACL_PROTECTED)
        if (!SetSecurityDescriptorDacl(pSd, TRUE, pDacl, FALSE)) {
            LocalFree(pDacl);
            return false;
        }

        SetSecurityDescriptorControl(pSd, SE_DACL_PROTECTED, SE_DACL_PROTECTED);

        pSa->nLength = sizeof(SECURITY_ATTRIBUTES);
        pSa->lpSecurityDescriptor = pSd;
        pSa->bInheritHandle = FALSE;

        *ppDaclOut = pDacl;
        return true;
    }

    static DWORD GetParentPid(DWORD pid) {
        HANDLE hSnapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if (hSnapshot == INVALID_HANDLE_VALUE) return 0;

        PROCESSENTRY32W pe32;
        pe32.dwSize = sizeof(PROCESSENTRY32W);
        DWORD parentPid = 0;

        if (Process32FirstW(hSnapshot, &pe32)) {
            do {
                if (pe32.th32ProcessID == pid) {
                    parentPid = pe32.th32ParentProcessID;
                    break;
                }
            } while (Process32NextW(hSnapshot, &pe32));
        }

        CloseHandle(hSnapshot);
        return parentPid;
    }

    static bool ValidateClientProcess(HANDLE hPipe, DWORD expectedPid) {
        ULONG clientPid = 0;
        if (!GetNamedPipeClientProcessId(hPipe, &clientPid)) {
            return false;
        }

        // 1. Verifier le PID (soit le client direct, soit le parent qui a lance le client bridge)
        if (expectedPid != 0) {
            if (clientPid != expectedPid) {
                DWORD parentPid = GetParentPid(clientPid);
                if (parentPid != expectedPid) {
                    return false;
                }
            }
        }

        // 2. Verifier l'executable du processus client
        HANDLE hProcess = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, clientPid);
        if (!hProcess) {
            return false;
        }

        wchar_t imagePath[MAX_PATH * 2] = { 0 };
        DWORD dwSize = sizeof(imagePath) / sizeof(imagePath[0]);
        bool validExecutable = false;

        if (QueryFullProcessImageNameW(hProcess, 0, imagePath, &dwSize)) {
            std::wstring pathStr(imagePath);
            std::transform(pathStr.begin(), pathStr.end(), pathStr.begin(), ::towlower);

            // Binaire autorises : astral-vanguard.exe, electron.exe (dev), node.exe (tests), astral-helper.exe (client), powershell.exe (tests)
            if (pathStr.rfind(L"\\astral-vanguard.exe") != std::wstring::npos ||
                pathStr.rfind(L"\\electron.exe") != std::wstring::npos ||
                pathStr.rfind(L"\\node.exe") != std::wstring::npos ||
                pathStr.rfind(L"\\astral-helper.exe") != std::wstring::npos ||
                pathStr.rfind(L"\\powershell.exe") != std::wstring::npos ||
                pathStr.rfind(L"\\pwsh.exe") != std::wstring::npos) {
                validExecutable = true;
            }
        }

        CloseHandle(hProcess);
        return validExecutable;
    }
};
