#!/bin/sh
# PS5 regression renders with a fixed clock, so before/after runs can be pixel-diffed.
# usage: ps5_regress.sh <outdir>
R=/workspace/ps5-menu/test/root V=$(realpath -m "$1") T=${TOOLS:-/workspace/ps5-menu/tools}
mkdir -p "$V"
$T/render.sh $R $V/tr_01_home_row.png '{"intro":"none","row":1,"zone":"row","clock":"12:00","wait":1200}'
$T/render.sh $R $V/tr_02_play_focused.png '{"intro":"none","row":2,"zone":"actions","clock":"12:00","wait":1200}'
$T/render.sh $R $V/tr_03_options_menu.png '{"intro":"none","row":3,"zone":"actions","action":1,"overlay":"menu","clock":"12:00","wait":1200}'
$T/render.sh $R $V/tr_04_hub_cards.png '{"intro":"none","row":1,"zone":"cards","clock":"12:00","wait":1200}'
$T/render.sh $R $V/tr_05_library.png '{"intro":"none","row":1,"overlay":"library","clock":"12:00","wait":1200}'
$T/render.sh $R $V/tr_06_settings.png '{"intro":"none","row":1,"overlay":"settings","inputMode":"keyboard","clock":"12:00","wait":1200}'
$T/render.sh $R $V/tr_08_media_tab.png '{"intro":"none","tab":"media","clock":"12:00","wait":1200}'
$T/render.sh $R $V/tr_09_desktop_tile.png '{"intro":"none","row":0,"zone":"row","clock":"12:00","wait":1200}'
$T/render.sh $R $V/tr_10_top_bar.png '{"intro":"none","row":1,"zone":"top","top":3,"clock":"12:00","wait":1200}'
$T/render.sh /workspace/ps5-menu/test/root-ref $V/ours_ref13.png '{"intro":"none","row":1,"zone":"row","clock":"6:28 PM","side":false,"scrim":false,"hub":["Friends Who Play"],"wait":1500}'
