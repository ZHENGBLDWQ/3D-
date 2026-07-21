; plate_idx = 2
M82
; layer: 0
; TYPE:Outer wall
G1 X1 Y1 E10
; TYPE:Support material
G1 X2 Y2 E12
; TYPE:Support material interface
G1 X3 Y3 E13
; TYPE:Brim
G1 X4 Y4 E14
; TYPE:Wipe tower
G1 X5 Y5 E16
; TYPE:Flush
G1 X6 Y6 E18
T1
; filament_id = 3
; TYPE:Prime line
G92 E0
G1 E2
; layer: 1
; TYPE:Future slicer role
G1 E3
M83
; TYPE:Inner wall
G1 E2
