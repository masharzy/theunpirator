<?php
/** Plugin Name: The Unpirator Protected Video */
if (!defined('ABSPATH')) exit;
add_shortcode('unpirator_video', function($atts) {
  $a = shortcode_atts(['asset' => ''], $atts);
  if (!$a['asset']) return '';
  $id = 'unpirator-' . wp_generate_uuid4();
  return '<div id="' . esc_attr($id) . '" data-unpirator-asset="' . esc_attr($a['asset']) . '"></div>';
});
// Production integration should enqueue the universal SDK and expose a WordPress REST endpoint
// that verifies the logged-in student's course access before calling The Unpirator server-to-server.
