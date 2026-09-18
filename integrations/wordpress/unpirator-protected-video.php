<?php
/** Plugin Name: The Unpirator Protected Video */
if (!defined('ABSPATH')) exit;
add_shortcode('unpirator_video', function($atts) {
  $a = shortcode_atts(['asset' => ''], $atts);
  if (!$a['asset']) return '';
  $id = 'unpirator-' . wp_generate_uuid4();
  return '<div id="' . esc_attr($id) . '" data-unpirator-asset="' . esc_attr($a['asset']) . '"></div>';
});
// Production integration must enqueue the universal SDK and expose a same-origin WordPress REST endpoint.
// That endpoint must verify the logged-in student's course access, read the authenticated account email
// from WordPress server-side state, require the SDK deviceId, and only then call The Unpirator
// server-to-server. Never accept a trusted viewer email from shortcode attributes or request JSON.
