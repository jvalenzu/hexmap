<script setup>
const props = defineProps(['turn_status', 'context_message', 'debug_options', 'action_buttons', 'change_debug_options']);
</script>

<template>
<div id="status-line" style="height: 40px;">
    <div id="debug-button-bar" style="float: left;">
        <select @change="change_debug_options">
            <option v-for="item in debug_options.value" :value="item.value">
                {{item.text}}
            </option>
        </select>
    </div>
    <div style="float: left; padding-right: 89px; padding-left: 89px;">{{turn_status.value}}</div>
    <div id="button-bar" style="float: right;">
        <template v-for="button in action_buttons.value">
            <button v-if="button.enabled" :id="button.id" :onclick="button.onclick">{{button.label}}</button>
            <button v-else disabled>{{button.label}}</button>
        </template>
    </div>
    {{context_message.value}}
</div>
</template>
