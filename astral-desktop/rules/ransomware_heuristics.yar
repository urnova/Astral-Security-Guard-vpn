/*
  Astral Vanguard v3.0 - YARA-X Rule Pack: Ransomware Indicators
  Detection of volume shadow copy deletion, recovery disabling, known ransom notes
*/

rule Ransomware_ShadowCopy_Deletion {
  meta:
    description = "Detects execution strings used to delete Windows Volume Shadow Copies"
    severity = "critical"
    author = "Astral Vanguard Security Team"
    version = "1.0"
  strings:
    $vss1 = "vssadmin" nocase
    $vss2 = "delete shadows" nocase
    $wmi1 = "wmic shadowcopy delete" nocase
    $wbadmin = "wbadmin delete catalog" nocase
    $bcd = "bcdedit /set {default} recoveryenabled No" nocase
  condition:
    ($vss1 and $vss2) or $wmi1 or $wbadmin or $bcd
}

rule Ransomware_RansomNote_Indicators {
  meta:
    description = "Detects classic ransom note phrasing demanding cryptocurrency"
    severity = "high"
    author = "Astral Vanguard Security Team"
    version = "1.0"
  strings:
    $n1 = "your files are encrypted" nocase
    $n2 = "your files have been encrypted" nocase
    $n3 = "all your personal files have been locked" nocase
    $p1 = "bitcoin" nocase
    $p2 = "tor browser" nocase
    $p3 = ".onion" nocase
  condition:
    ($n1 or $n2 or $n3) and ($p1 or $p2 or $p3)
}
