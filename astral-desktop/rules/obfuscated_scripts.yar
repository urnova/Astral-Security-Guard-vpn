/*
  Astral Vanguard v3.0 - YARA-X Rule Pack: Obfuscated Scripts
  Detection of suspicious script patterns: Base64 decode, AMSI bypass, reflection
*/

rule Obfuscated_PowerShell_EncodedCommand {
  meta:
    description = "Detects PowerShell EncodedCommand usage commonly used by droppers"
    severity = "medium"
    author = "Astral Vanguard Security Team"
    version = "1.0"
  strings:
    $p1 = "powershell" nocase
    $p2 = "pwsh" nocase
    $e1 = "-EncodedCommand" nocase
    $e2 = "-e " nocase
    $e3 = "-enc " nocase
  condition:
    ($p1 or $p2) and ($e1 or $e2 or $e3)
}

rule PowerShell_AMSI_Bypass_AmsiUtils {
  meta:
    description = "Detects classic AmsiUtils.amsiInitFailed memory patching"
    severity = "high"
    author = "Astral Vanguard Security Team"
    version = "1.0"
  strings:
    $a1 = "System.Management.Automation.AmsiUtils" nocase
    $a2 = "amsiInitFailed" nocase
    $a3 = "NonPublic,Static" nocase
  condition:
    all of ($a1, $a2, $a3)
}

rule Suspicious_VBS_Dropper {
  meta:
    description = "Detects VBScript launching WScript.Shell with hidden execution"
    severity = "medium"
    author = "Astral Vanguard Security Team"
    version = "1.0"
  strings:
    $s1 = "WScript.Shell" nocase
    $s2 = ".Run" nocase
    $s3 = "cmd.exe" nocase
    $s4 = "0, True" nocase
  condition:
    $s1 and $s2 and ($s3 or $s4)
}
