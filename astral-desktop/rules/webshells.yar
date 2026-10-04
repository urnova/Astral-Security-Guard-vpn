/*
  Astral Vanguard v3.0 - YARA-X Rule Pack: Generic Web Shells
  Detection of PHP, ASPX, JSP webshell signatures
*/

rule Generic_PHP_WebShell_Eval {
  meta:
    description = "Detects PHP webshell using eval with base64_decode or request params"
    severity = "critical"
    author = "Astral Vanguard Security Team"
    version = "1.0"
  strings:
    $php = "<?php" nocase
    $e1 = "eval(" nocase
    $e2 = "assert(" nocase
    $b1 = "base64_decode" nocase
    $r1 = "$_POST" nocase
    $r2 = "$_GET" nocase
    $r3 = "$_REQUEST" nocase
  condition:
    $php and ($e1 or $e2) and ($b1 or $r1 or $r2 or $r3)
}

rule Generic_ASPX_WebShell_Cmd {
  meta:
    description = "Detects ASPX webshell launching cmd.exe or PowerShell via ProcessStartInfo"
    severity = "critical"
    author = "Astral Vanguard Security Team"
    version = "1.0"
  strings:
    $a1 = "System.Diagnostics.Process" nocase
    $a2 = "ProcessStartInfo" nocase
    $c1 = "cmd.exe" nocase
    $c2 = "powershell.exe" nocase
  condition:
    $a1 and $a2 and ($c1 or $c2)
}
