package com.nekoslio.simpshare;

import android.os.Bundle;

import androidx.appcompat.app.AppCompatActivity;

/** 桌面入口：只展示操作流程。真正的功能入口在任意应用的系统分享菜单里。 */
public class MainActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(FlowView.instructions(this));
    }
}
