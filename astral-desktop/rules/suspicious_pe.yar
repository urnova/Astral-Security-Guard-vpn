/*
  Astral Vanguard v3.0 - YARA-X Rule Pack: Suspicious PE Indicators
  Detection of embedded reverse shells, keylogger hooks, hollow process indicators
*/

rule Suspicious_ProcessHollowing_APIs {
  meta:
    description = "Detects sequence of API calls typically associated with process hollowing"
    severity = "high"
    author = "Astral Vanguard Security Team"
    version = "1.0"
  strings:
    $a1 = "NtUnmapViewOfSection" ascii wide
    $a2 = "VirtualAllocEx" ascii wide
    $a3 = "WriteProcessMemory" ascii wide
    $a4 = "SetThreadContext" ascii wide
    $a5 = "ResumeThread" ascii wide
  condition:
    3 of ($a1, $a2, $a3, $a4, $a5)
}

rule Suspicious_Keylogger_Hook {
  meta:
    description = "Detects Windows keyboard hook installation combined with file or socket export"
    severity = "medium"
    author = "Astral Vanguard Security Team"
    version = "1.0"
  strings:
    $h1 = "SetWindowsHookEx" ascii wide
    $h2 = "WH_KEYBOARD_LL" ascii wide
    $h3 = "GetAsyncKeyState" ascii wide
    $w1 = "CreateFile" ascii wide
    $w2 = "WSASend" ascii wide
  condition:
    ($h1 or $h2 or $h3) and ($w1 or $w2)
}
